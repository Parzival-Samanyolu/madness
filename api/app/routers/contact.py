"""Contact form: visitors ask for the Myelin plan (or anything else); the admin reads them in the panel."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..limits import hit
from ..models import ContactMessage, User
from ..security import COOKIE_NAME, admin_user, client_ip, user_from_session_token

router = APIRouter(prefix="/api", tags=["contact"])


class ContactBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    topic: Literal["myelin", "business", "other"] = "myelin"
    message: str = Field(min_length=1, max_length=5000)


@router.post("/contact")
def send(body: ContactBody, request: Request, db: Session = Depends(get_db)):
    hit(f"contact:{client_ip(request)}", 5, 3600, "Too many messages. Try again in an hour.")
    user = user_from_session_token(db, request.cookies.get(COOKIE_NAME))
    db.add(ContactMessage(user_id=user.id if user else None, name=body.name.strip(), email=str(body.email),
                          topic=body.topic, message=body.message.strip()))
    db.commit()
    return {"ok": True}


def _out(m: ContactMessage, user: User | None) -> dict:
    return {"id": m.id, "name": m.name, "email": m.email, "topic": m.topic, "message": m.message,
            "handled": m.handled, "created_at": m.created_at,
            "user": {"id": user.id, "email": user.email, "plan": user.plan} if user else None}


@router.get("/admin/messages")
def list_messages(admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(ContactMessage).order_by(ContactMessage.created_at.desc()).limit(200)).all()
    return [_out(m, db.get(User, m.user_id) if m.user_id else None) for m in rows]


class HandledBody(BaseModel):
    handled: bool


@router.patch("/admin/messages/{msg_id}")
def set_handled(msg_id: int, body: HandledBody, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    m = db.get(ContactMessage, msg_id)
    if not m:
        raise HTTPException(404, "Message not found")
    m.handled = body.handled
    db.commit()
    return _out(m, db.get(User, m.user_id) if m.user_id else None)
