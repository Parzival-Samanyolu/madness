import os
import sys
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "mock-llm"))
sys.path.insert(0, str(ROOT / "api"))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/test.db")
    monkeypatch.setenv("REDIS_URL", "")
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "adminpass123")
    monkeypatch.setenv("SECRET_KEY", "test-secret")
    monkeypatch.setenv("MOCK_DELAY", "0")
    from app import config, limits, llm
    config.get_settings.cache_clear()
    limits.reset_store()
    import mock_llm
    mock_llm.DELAY = 0
    llm.set_transport(httpx.ASGITransport(app=mock_llm.app))
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c
    llm.set_transport(None)


def signup(client, email="user@example.com", password="password123"):
    r = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def make_key(client):
    r = client.post("/api/keys", json={"name": "test"})
    assert r.status_code == 200, r.text
    return r.json()["key"]
