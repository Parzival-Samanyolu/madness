import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..limits import hit, plan_for, tokens_used_today
from ..models import LoginSession, User
from ..security import (COOKIE_NAME, client_ip, create_session, current_user,
                        hash_password, sha256, verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Credentials(BaseModel):
    email: str
    password: str


class SignupBody(Credentials):
    # "Help improve Synapse" checkbox on the sign-up page (off unless the user ticks it)
    training_opt_in: bool = False


def user_out(u: User) -> dict:
    plan = plan_for(u.plan)
    return {
        "id": u.id, "email": u.email, "plan": plan.model_dump(), "is_admin": u.is_admin,
        "tokens_used_today": tokens_used_today(u.id), "training_opt_in": u.training_opt_in,
    }


def _set_cookie(resp: Response, token: str):
    s = get_settings()
    resp.set_cookie(COOKIE_NAME, token, max_age=s.session_days * 86400, httponly=True,
                    secure=s.cookie_secure, samesite="lax", path="/")


@router.post("/signup")
def signup(body: SignupBody, request: Request, response: Response, db: Session = Depends(get_db)):
    s = get_settings()
    if not s.signups_open:
        raise HTTPException(403, "Sign-ups are closed right now")
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 320:
        raise HTTPException(400, "Enter a valid email address")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    hit(f"signup:{client_ip(request)}", s.signups_per_ip_per_hour, 3600,
        "Too many sign-ups from your network, try again later")
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=email, password_hash=hash_password(body.password), training_opt_in=body.training_opt_in)
    db.add(user)
    db.commit()
    _set_cookie(response, create_session(db, user))
    return user_out(user)


@router.post("/login")
def login(body: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    hit(f"login:{client_ip(request)}", get_settings().login_attempts_per_ip_per_minute, 60,
        "Too many login attempts, wait a minute")
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    if user.is_banned:
        raise HTTPException(403, "This account has been disabled")
    _set_cookie(response, create_session(db, user))
    return user_out(user)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        sess = db.get(LoginSession, sha256(token))
        if sess:
            db.delete(sess)
            db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/password")
def change_password(body: PasswordChange, request: Request, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    hit(f"password:{user.id}", get_settings().login_attempts_per_ip_per_minute, 60,
        "Too many attempts, wait a minute")
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Your current password is wrong")
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    user.password_hash = hash_password(body.new_password)
    # log out every other device; keep this one
    keep = sha256(request.cookies.get(COOKIE_NAME) or "")
    for sess in db.scalars(select(LoginSession).where(LoginSession.user_id == user.id)):
        if sess.token_hash != keep:
            db.delete(sess)
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)
