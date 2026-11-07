"""Rate limits, daily token quotas and concurrency slots.

Uses Redis in production. Falls back to an in-process store for local dev/tests
(fine for a single uvicorn worker, which is what we run).
"""
import threading
import time
from datetime import datetime, timezone

from fastapi import HTTPException

from .config import PLANS, Plan, get_settings


class MemoryStore:
    def __init__(self):
        self._data: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def _get(self, key):
        v = self._data.get(key)
        if v and v[1] < time.time():
            self._data.pop(key, None)
            return None
        return v

    def incrby(self, key: str, amount: int, ttl: int) -> int:
        with self._lock:
            v = self._get(key)
            if v is None:
                v = (0, time.time() + ttl)
            nv = (v[0] + amount, v[1])
            self._data[key] = nv
            return nv[0]

    def get(self, key: str) -> int:
        with self._lock:
            v = self._get(key)
            return v[0] if v else 0


class RedisStore:
    def __init__(self, url: str):
        import redis

        self.r = redis.Redis.from_url(url, decode_responses=True)

    def incrby(self, key: str, amount: int, ttl: int) -> int:
        pipe = self.r.pipeline()
        pipe.incrby(key, amount)
        pipe.expire(key, ttl, nx=True)
        return int(pipe.execute()[0])

    def get(self, key: str) -> int:
        return int(self.r.get(key) or 0)


_store = None


def store():
    global _store
    if _store is None:
        url = get_settings().redis_url
        _store = RedisStore(url) if url else MemoryStore()
    return _store


def reset_store():
    global _store
    _store = None


def plan_for(name: str) -> Plan:
    return PLANS.get(name, PLANS["free"])


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def hit(key: str, limit: int, window: int, message: str):
    """Fixed-window counter. Raises 429 when over the limit."""
    bucket = int(time.time() // window)
    n = store().incrby(f"rl:{key}:{bucket}", 1, window + 5)
    if n > limit:
        raise HTTPException(429, {"message": message, "type": "rate_limit_error"})


def check_request(user_id: int, plan: Plan):
    hit(f"rpm:{user_id}", plan.requests_per_minute, 60,
        f"Rate limit: {plan.requests_per_minute} requests/minute on the {plan.label} plan")
    used = tokens_used_today(user_id)
    if used >= plan.tokens_per_day:
        raise HTTPException(429, {
            "message": f"Daily token limit reached ({plan.tokens_per_day:,} on the {plan.label} plan). Resets at 00:00 UTC.",
            "type": "rate_limit_error",
        })


def tokens_used_today(user_id: int) -> int:
    return store().get(f"tok:{user_id}:{_today()}")


def add_tokens(user_id: int, n: int):
    store().incrby(f"tok:{user_id}:{_today()}", n, 60 * 60 * 26)


class Slot:
    """Limits simultaneous generations per user (the GPU is shared)."""

    def __init__(self, user_id: int, plan: Plan):
        self.key = f"conc:{user_id}"
        self.limit = plan.max_concurrent
        self.held = False

    def acquire(self):
        n = store().incrby(self.key, 1, 600)
        if n > self.limit:
            store().incrby(self.key, -1, 600)
            raise HTTPException(429, {
                "message": f"Only {self.limit} generation(s) at a time on your plan. Wait for the current one to finish.",
                "type": "rate_limit_error",
            })
        self.held = True

    def release(self):
        if self.held:
            store().incrby(self.key, -1, 600)
            self.held = False
