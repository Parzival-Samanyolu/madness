from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import llm
from ..config import PLANS
from ..db import get_db, utcnow
from ..models import ApiKey, LoginSession, Usage, User
from ..security import admin_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


class UserPatch(BaseModel):
    plan: str | None = None
    is_banned: bool | None = None
    is_admin: bool | None = None


@router.get("/stats")
async def stats(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    since = utcnow() - timedelta(days=1)
    return {
        "users": db.scalar(select(func.count()).select_from(User)),
        "signups_24h": db.scalar(select(func.count()).select_from(User).where(User.created_at >= since)),
        "active_keys": db.scalar(select(func.count()).select_from(ApiKey).where(ApiKey.revoked_at.is_(None))),
        "requests_24h": db.scalar(select(func.count()).select_from(Usage).where(Usage.created_at >= since)),
        "tokens_24h": int(db.scalar(select(func.sum(Usage.prompt_tokens + Usage.completion_tokens))
                                    .where(Usage.created_at >= since)) or 0),
        "model_online": await llm.health(),
    }


@router.get("/users")
def users(q: str = "", admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    since = utcnow() - timedelta(days=1)
    tok = (select(Usage.user_id, func.sum(Usage.prompt_tokens + Usage.completion_tokens).label("t"))
           .where(Usage.created_at >= since).group_by(Usage.user_id).subquery())
    stmt = (select(User, tok.c.t).outerjoin(tok, tok.c.user_id == User.id)
            .order_by(User.created_at.desc()).limit(500))
    if q:
        stmt = stmt.where(User.email.contains(q.lower()))
    return [{"id": u.id, "email": u.email, "plan": u.plan, "is_admin": u.is_admin,
             "is_banned": u.is_banned, "created_at": u.created_at, "tokens_24h": int(t or 0)}
            for u, t in db.execute(stmt)]


@router.patch("/users/{user_id}")
def patch_user(user_id: int, body: UserPatch, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == admin.id and (body.is_banned or body.is_admin is False):
        raise HTTPException(400, "You can't ban or demote yourself")
    if body.plan is not None:
        if body.plan not in PLANS:
            raise HTTPException(400, "Unknown plan")
        u.plan = body.plan
    if body.is_admin is not None:
        u.is_admin = body.is_admin
    if body.is_banned is not None:
        u.is_banned = body.is_banned
        if body.is_banned:  # log them out everywhere
            for s in db.scalars(select(LoginSession).where(LoginSession.user_id == u.id)):
                db.delete(s)
    db.commit()
    return {"ok": True}
