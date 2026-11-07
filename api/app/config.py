from functools import lru_cache

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class Plan(BaseModel):
    name: str
    label: str
    price_usd: int  # per month, 0 = free
    requests_per_minute: int
    tokens_per_day: int
    max_output_tokens: int
    max_concurrent: int
    max_context_tokens: int  # prompt + history the model sees per request


PLANS: dict[str, Plan] = {
    "free": Plan(
        name="free", label="Free", price_usd=0,
        requests_per_minute=10, tokens_per_day=200_000,
        max_output_tokens=4096, max_concurrent=1, max_context_tokens=32_000,
    ),
    "pro": Plan(
        name="pro", label="Pro", price_usd=10,
        requests_per_minute=60, tokens_per_day=1_000_000,
        max_output_tokens=16384, max_concurrent=3, max_context_tokens=120_000,
    ),
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=("settings_",))

    app_name: str = "Madness"
    database_url: str = "sqlite:///./.cache/dev.db"
    redis_url: str = ""  # empty = in-memory limiter (dev only)
    llm_url: str = "http://localhost:9000"
    llm_api_key: str = ""  # shared secret with llama.cpp on the GPU box
    model_name: str = "gpt-oss-20b"

    secret_key: str = "dev-insecure-change-me"
    cookie_secure: bool = False
    session_days: int = 30

    signups_open: bool = True
    signups_per_ip_per_hour: int = 5
    login_attempts_per_ip_per_minute: int = 10

    admin_email: str = ""
    admin_password: str = ""

    stripe_webhook_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
