"""Admin panel API: overview stats, users (with details and actions), activity feed, system info."""
import json
import secrets
import time
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import llm
from ..config import PLANS, get_settings
from ..db import get_db, utcnow
from ..limits import tokens_used_today, usd_used_this_week
from ..models import ApiKey, Conversation, LoginSession, Message, Usage, User
from ..security import admin_user, hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])
TOKENS = Usage.prompt_tokens + Usage.completion_tokens


class UserPatch(BaseModel):
    plan: str | None = None
    is_banned: bool | None = None
    is_admin: bool | None = None


def _count(db: Session, model, *where) -> int:
    return int(db.scalar(select(func.count()).select_from(model).where(*where)) or 0)


def _tokens(db: Session, *where) -> int:
    return int(db.scalar(select(func.sum(TOKENS)).where(*where)) or 0)


def _daily(db: Session, days: int, *where) -> list[dict]:
    """Per-day usage for the last `days` days (oldest first), zero-filled."""
    start = (utcnow() - timedelta(days=days - 1)).date()
    day = func.date(Usage.created_at)
    rows = db.execute(
        select(day, Usage.source, func.sum(TOKENS), func.count())
        .where(Usage.created_at >= start, *where).group_by(day, Usage.source)).all()
    # str(): SQLite returns dates as text, Postgres as date objects
    signups = {str(d): int(n) for d, n in db.execute(
        select(func.date(User.created_at), func.count())
        .where(User.created_at >= start).group_by(func.date(User.created_at))).all()}
    out = {}
    for i in range(days):
        d = str(start + timedelta(days=i))
        out[d] = {"date": d, "web_tokens": 0, "api_tokens": 0, "requests": 0, "signups": signups.get(d, 0)}
    for d, source, tok, n in rows:
        r = out.get(str(d))
        if r:
            r["web_tokens" if source == "web" else "api_tokens"] += int(tok or 0)
            r["requests"] += int(n)
    return list(out.values())


@router.get("/stats")
def stats(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    now = utcnow()
    d1, d7, d30 = now - timedelta(days=1), now - timedelta(days=7), now - timedelta(days=30)
    top = db.execute(
        select(User.id, User.email, User.plan, func.sum(TOKENS).label("t"), func.count().label("n"))
        .join(Usage, Usage.user_id == User.id).where(Usage.created_at >= d7)
        .group_by(User.id, User.email, User.plan).order_by(func.sum(TOKENS).desc()).limit(8)).all()
    return {
        "users": _count(db, User),
        "pro_users": _count(db, User, User.plan == "pro"),
        "banned_users": _count(db, User, User.is_banned.is_(True)),
        "signups_24h": _count(db, User, User.created_at >= d1),
        "signups_7d": _count(db, User, User.created_at >= d7),
        "active_users_24h": int(db.scalar(select(func.count(func.distinct(Usage.user_id))).where(Usage.created_at >= d1)) or 0),
        "active_users_7d": int(db.scalar(select(func.count(func.distinct(Usage.user_id))).where(Usage.created_at >= d7)) or 0),
        "requests_24h": _count(db, Usage, Usage.created_at >= d1),
        "tokens_24h": _tokens(db, Usage.created_at >= d1),
        "tokens_7d": _tokens(db, Usage.created_at >= d7),
        "tokens_30d": _tokens(db, Usage.created_at >= d30),
        "web_tokens_7d": _tokens(db, Usage.created_at >= d7, Usage.source == "web"),
        "api_tokens_7d": _tokens(db, Usage.created_at >= d7, Usage.source == "api"),
        "conversations": _count(db, Conversation),
        "messages": _count(db, Message),
        "active_keys": _count(db, ApiKey, ApiKey.revoked_at.is_(None)),
        "daily": _daily(db, 30),
        "top_users_7d": [{"id": i, "email": e, "plan": p, "tokens": int(t or 0), "requests": int(n)} for i, e, p, t, n in top],
    }


@router.get("/users")
def users(q: str = "", admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    now = utcnow()
    agg = (select(Usage.user_id,
                  func.sum(TOKENS).filter(Usage.created_at >= now - timedelta(days=1)).label("t1"),
                  func.sum(TOKENS).filter(Usage.created_at >= now - timedelta(days=7)).label("t7"),
                  func.sum(TOKENS).label("tall"),
                  func.max(Usage.created_at).label("last"))
           .group_by(Usage.user_id).subquery())
    convs = select(Conversation.user_id, func.count().label("c")).group_by(Conversation.user_id).subquery()
    keys = (select(ApiKey.user_id, func.count().label("k")).where(ApiKey.revoked_at.is_(None))
            .group_by(ApiKey.user_id).subquery())
    stmt = (select(User, agg.c.t1, agg.c.t7, agg.c.tall, agg.c.last, convs.c.c, keys.c.k)
            .outerjoin(agg, agg.c.user_id == User.id).outerjoin(convs, convs.c.user_id == User.id)
            .outerjoin(keys, keys.c.user_id == User.id)
            .order_by(User.created_at.desc()).limit(1000))
    if q:
        stmt = stmt.where(User.email.contains(q.strip().lower()))
    return [{"id": u.id, "email": u.email, "plan": u.plan, "is_admin": u.is_admin, "is_banned": u.is_banned,
             "created_at": u.created_at, "last_active": last, "tokens_24h": int(t1 or 0), "tokens_7d": int(t7 or 0),
             "tokens_total": int(tall or 0), "conversations": int(c or 0), "api_keys": int(k or 0)}
            for u, t1, t7, tall, last, c, k in db.execute(stmt)]


def _user(db: Session, user_id: int) -> User:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    return u


@router.get("/users/{user_id}")
def user_detail(user_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = _user(db, user_id)
    now = utcnow()
    keys = db.scalars(select(ApiKey).where(ApiKey.user_id == u.id).order_by(ApiKey.created_at.desc())).all()
    plan = PLANS.get(u.plan) or PLANS["free"]
    return {
        "id": u.id, "email": u.email, "plan": u.plan, "is_admin": u.is_admin, "is_banned": u.is_banned,
        "created_at": u.created_at, "training_opt_in": u.training_opt_in,
        "last_active": db.scalar(select(func.max(Usage.created_at)).where(Usage.user_id == u.id)),
        "tokens_today": tokens_used_today(u.id),
        "usd_this_week": round(usd_used_this_week(u.id), 4), "usd_per_week": plan.usd_per_week,
        "tokens_7d": _tokens(db, Usage.user_id == u.id, Usage.created_at >= now - timedelta(days=7)),
        "tokens_total": _tokens(db, Usage.user_id == u.id),
        "requests_total": _count(db, Usage, Usage.user_id == u.id),
        "conversations": _count(db, Conversation, Conversation.user_id == u.id),
        "messages": int(db.scalar(select(func.count()).select_from(Message).join(Conversation)
                                  .where(Conversation.user_id == u.id)) or 0),
        "sessions": _count(db, LoginSession, LoginSession.user_id == u.id, LoginSession.expires_at > now),
        "api_keys": [{"id": k.id, "name": k.name, "prefix": k.prefix, "created_at": k.created_at,
                      "last_used_at": k.last_used_at, "revoked": k.revoked_at is not None} for k in keys],
        "daily": _daily(db, 30, Usage.user_id == u.id),
    }


@router.patch("/users/{user_id}")
def patch_user(user_id: int, body: UserPatch, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = _user(db, user_id)
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


@router.post("/users/{user_id}/logout")
def logout_everywhere(user_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = _user(db, user_id)
    if u.id == admin.id:
        raise HTTPException(400, "Use Settings to log yourself out")
    n = 0
    for s in db.scalars(select(LoginSession).where(LoginSession.user_id == u.id)):
        db.delete(s); n += 1
    db.commit()
    return {"ok": True, "sessions_ended": n}


@router.post("/users/{user_id}/revoke-keys")
def revoke_keys(user_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    u = _user(db, user_id)
    n = 0
    for k in db.scalars(select(ApiKey).where(ApiKey.user_id == u.id, ApiKey.revoked_at.is_(None))):
        k.revoked_at = utcnow(); n += 1
    db.commit()
    return {"ok": True, "keys_revoked": n}


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Sets a random temporary password (shown once to the admin) and logs the user out everywhere."""
    u = _user(db, user_id)
    if u.id == admin.id:
        raise HTTPException(400, "Use Settings to change your own password")
    temp = secrets.token_urlsafe(9)
    u.password_hash = hash_password(temp)
    for s in db.scalars(select(LoginSession).where(LoginSession.user_id == u.id)):
        db.delete(s)
    db.commit()
    return {"ok": True, "temporary_password": temp}


@router.get("/activity")
def activity(limit: int = 50, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Usage, User.email, ApiKey.name).join(User, User.id == Usage.user_id)
        .outerjoin(ApiKey, ApiKey.id == Usage.api_key_id)
        .order_by(Usage.id.desc()).limit(min(max(limit, 1), 200))).all()
    signups = db.scalars(select(User).order_by(User.created_at.desc()).limit(10)).all()
    return {
        "requests": [{"id": r.id, "user_id": r.user_id, "email": e, "source": r.source, "key_name": k,
                      "prompt_tokens": r.prompt_tokens, "completion_tokens": r.completion_tokens,
                      "created_at": r.created_at} for r, e, k in rows],
        "signups": [{"id": u.id, "email": u.email, "created_at": u.created_at} for u in signups],
    }


_or_cache: dict = {"at": 0.0, "data": None}


async def _openrouter_info() -> dict | None:
    s = get_settings()
    if not s.fallback_llm_api_key:
        return None
    if time.monotonic() - _or_cache["at"] < 60:
        return _or_cache["data"]
    data = None
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(f"{s.fallback_llm_url}/v1/key", headers={"Authorization": f"Bearer {s.fallback_llm_api_key}"})
            if r.status_code == 200:
                d = r.json().get("data") or {}
                data = {"usage_usd": d.get("usage"), "limit_usd": d.get("limit"), "is_free_tier": d.get("is_free_tier")}
    except httpx.HTTPError:
        pass
    _or_cache.update(at=time.monotonic(), data=data)
    return data


@router.get("/system")
async def system(admin: User = Depends(admin_user)):
    s = get_settings()
    gpu = await llm.health()
    fallback = bool(s.fallback_llm_api_key)
    return {
        "gpu_online": gpu,
        "fallback_ready": fallback,
        "serving": "gpu" if gpu else "openrouter" if fallback else "offline",
        "gpu_model": s.model_name,
        "public_model": s.public_model,
        "fallback_models": [m.strip() for m in s.fallback_models.split(",") if m.strip()] if fallback else [],
        "openrouter": await _openrouter_info(),
        "signups_open": s.signups_open,
        "plans": [p.model_dump() for p in PLANS.values()],
        "app_name": s.app_name, "company_name": s.company_name,
    }


def _training_convs(db: Session) -> list[Conversation]:
    opted_in = select(User.id).where(User.training_opt_in.is_(True))
    return db.scalars(select(Conversation).where(Conversation.user_id.in_(opted_in)).order_by(Conversation.id)).all()


def training_rows(db: Session, reasoning: bool = True) -> list[dict]:
    """One {"messages": [...]} row per chat, only from users who turned on "Help improve Synapse".
    No emails or ids: just the conversation. Assistant reasoning goes in a separate "thinking" field."""
    out = []
    for c in _training_convs(db):
        msgs = db.scalars(select(Message).where(Message.conversation_id == c.id).order_by(Message.id)).all()
        rows = []
        for m in msgs:
            if not m.content.strip():
                continue
            if rows and rows[-1]["role"] == m.role:  # e.g. an unanswered message: keep the turns alternating
                rows.pop()
            row = {"role": m.role, "content": m.content}
            if m.role == "assistant" and reasoning and m.reasoning.strip():
                row["thinking"] = m.reasoning
            rows.append(row)
        while rows and rows[0]["role"] != "user":
            rows.pop(0)
        while rows and rows[-1]["role"] != "assistant":
            rows.pop()
        if rows:
            out.append({"messages": rows})
    return out


@router.get("/training/stats")
def training_stats(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = training_rows(db, reasoning=False)
    return {"users_opted_in": _count(db, User, User.training_opt_in.is_(True)), "users": _count(db, User),
            "conversations": len(rows), "turns": sum(len(r["messages"]) // 2 for r in rows)}


@router.get("/training/export")
def training_export(reasoning: bool = True, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Download a JSONL file (one chat per line, OpenAI fine-tuning "messages" format)."""
    body = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in training_rows(db, reasoning))
    name = f"synapse-training-{utcnow():%Y-%m-%d}.jsonl"
    return Response(body, media_type="application/x-ndjson",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
