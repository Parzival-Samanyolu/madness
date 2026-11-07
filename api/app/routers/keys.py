from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db, utcnow
from ..models import ApiKey, User
from ..security import current_user, new_api_key, sha256

router = APIRouter(prefix="/api/keys", tags=["keys"])
MAX_KEYS = 10


class NewKey(BaseModel):
    name: str = Field(default="My key", max_length=100)


def key_out(k: ApiKey) -> dict:
    return {"id": k.id, "name": k.name, "prefix": k.prefix, "created_at": k.created_at,
            "last_used_at": k.last_used_at, "revoked": k.revoked_at is not None}


@router.get("")
def list_keys(user: User = Depends(current_user), db: Session = Depends(get_db)):
    keys = db.scalars(select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
                      .order_by(ApiKey.created_at.desc()))
    return [key_out(k) for k in keys]


@router.post("")
def create_key(body: NewKey, user: User = Depends(current_user), db: Session = Depends(get_db)):
    active = db.scalars(select(ApiKey).where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))).all()
    if len(active) >= MAX_KEYS:
        raise HTTPException(400, f"You can have at most {MAX_KEYS} keys")
    raw = new_api_key()
    k = ApiKey(user_id=user.id, name=body.name.strip() or "My key", prefix=raw[:11], key_hash=sha256(raw))
    db.add(k)
    db.commit()
    return {**key_out(k), "key": raw}  # the only time the full key is ever returned


@router.delete("/{key_id}")
def revoke_key(key_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    k = db.get(ApiKey, key_id)
    if not k or k.user_id != user.id:
        raise HTTPException(404, "Key not found")
    k.revoked_at = utcnow()
    db.commit()
    return {"ok": True}
