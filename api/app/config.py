from functools import lru_cache

from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class Plan(BaseModel):
    name: str
    label: str
    price_usd: int  # per month, 0 = free
    requests_per_minute: int
    usd_per_week: float  # usage allowance, measured at price_per_million_usd; resets Monday 00:00 UTC
    price_per_million_usd: float  # one price for input and output tokens
    cache_price_per_million_usd: float  # input tokens the model server already had cached
    max_output_tokens: int
    max_concurrent: int
    max_context_tokens: int  # prompt + history the model sees per request


# Internal names stay "free"/"pro" (stored on users); people see Neuron and Myelin.
PRICE_PER_MILLION_USD = 1.0
CACHE_PRICE_PER_MILLION_USD = 0.10

PLANS: dict[str, Plan] = {
    "free": Plan(
        name="free", label="Neuron", price_usd=0,
        requests_per_minute=20, usd_per_week=10, price_per_million_usd=PRICE_PER_MILLION_USD,
        cache_price_per_million_usd=CACHE_PRICE_PER_MILLION_USD,
        max_output_tokens=8192, max_concurrent=1, max_context_tokens=128_000,
    ),
    "pro": Plan(
        name="pro", label="Myelin", price_usd=10,
        requests_per_minute=60, usd_per_week=50, price_per_million_usd=PRICE_PER_MILLION_USD,
        cache_price_per_million_usd=CACHE_PRICE_PER_MILLION_USD,
        max_output_tokens=16384, max_concurrent=3, max_context_tokens=128_000,
    ),
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=("settings_",))

    app_name: str = "Synapse"
    company_name: str = "Samanyolu AI"
    public_model: str = "synapse-2"  # the name users and API clients see
    database_url: str = "sqlite:///./.cache/dev.db"
    redis_url: str = ""  # empty = in-memory limiter (dev only)
    llm_url: str = "http://localhost:9000"
    llm_api_key: str = ""  # shared secret with llama.cpp on the GPU box
    model_name: str = "gpt-oss-20b"  # what the GPU box actually runs (never shown to users)
    # Backup while the GPU box is offline: OpenRouter (or any OpenAI-style server).
    # Only used when FALLBACK_LLM_API_KEY is set. The first model is tried first; the rest are backups.
    fallback_llm_url: str = "https://openrouter.ai/api"
    fallback_llm_api_key: str = ""
    fallback_models: str = "nvidia/nemotron-3.5-super-vl:free,recursive/flint-v1.0:free"

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
