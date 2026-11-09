from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from . import llm
from .config import get_settings
from .db import SessionLocal, init_engine
from .models import User
from .routers import account, admin, auth, billing, chat, keys, memories, openai_api
from .security import hash_password


def bootstrap_admin():
    s = get_settings()
    if not (s.admin_email and s.admin_password):
        return
    db = SessionLocal()
    try:
        email = s.admin_email.strip().lower()
        u = db.scalar(select(User).where(User.email == email))
        if not u:
            db.add(User(email=email, password_hash=hash_password(s.admin_password), is_admin=True, plan="pro"))
        elif not u.is_admin:
            u.is_admin = True
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if get_settings().secret_key == "dev-insecure-change-me" and get_settings().cookie_secure:
        raise RuntimeError("SECRET_KEY must be set in production")
    init_engine()
    bootstrap_admin()
    yield


app = FastAPI(title="Madness API", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    # /v1 speaks OpenAI's error format, the website gets {"detail": "..."}
    if request.url.path.startswith("/v1"):
        d = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail), "type": "invalid_request_error"}
        return JSONResponse({"error": d}, status_code=exc.status_code, headers=exc.headers)
    detail = exc.detail["message"] if isinstance(exc.detail, dict) else exc.detail
    return JSONResponse({"detail": detail}, status_code=exc.status_code, headers=exc.headers)


@app.get("/api/health")
async def health():
    return {"ok": True, "model_online": await llm.health()}


for r in (auth, keys, chat, account, admin, billing, openai_api, memories):
    app.include_router(r.router)
