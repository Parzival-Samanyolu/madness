"""Search, pin, share links, AI titles, memory notice/edit, training opt-in and export."""
import json

from conftest import signup
from test_chat import events


def _chat(client, text, cid=None, **extra):
    cid = cid or client.post("/api/conversations").json()["id"]
    with client.stream("POST", f"/api/conversations/{cid}/messages", json={"content": text, **extra}) as r:
        return cid, events(r)


def test_search_titles_and_message_text(client):
    signup(client)
    a, _ = _chat(client, "Tell me about pandas dataframes")
    b, _ = _chat(client, "Plan a trip")
    client.patch(f"/api/conversations/{b}", json={"title": "Istanbul trip"})
    assert [c["id"] for c in client.get("/api/conversations/search?q=istanbul").json()] == [b]
    hits = client.get("/api/conversations/search?q=DATAFRAMES").json()
    assert [c["id"] for c in hits] == [a] and "dataframes" in hits[0]["snippet"].lower()
    assert client.get("/api/conversations/search?q=x").json() == []        # too short
    assert client.get("/api/conversations/search?q=100%25").json() == []   # % is not a wildcard
    client.cookies.clear()
    signup(client, "other@example.com")
    assert client.get("/api/conversations/search?q=pandas").json() == []


def test_pin_keeps_title(client):
    signup(client)
    cid, _ = _chat(client, "hello")
    title = client.get(f"/api/conversations/{cid}").json()["title"]
    r = client.patch(f"/api/conversations/{cid}", json={"pinned": True}).json()
    assert r["pinned"] is True and r["title"] == title
    assert client.get("/api/conversations").json()[0]["pinned"] is True


def test_ai_title_cleanup():
    from app.routers.chat import _clean_title
    assert _clean_title('"Python Hello World."') == "Python Hello World"
    assert _clean_title("\n\nTitle: Trip to Baku\nmore") == "Trip to Baku"
    assert len(_clean_title("x" * 200)) == 60
    assert _clean_title("**Baku Trip Plan**") == "Baku Trip Plan"


def test_share_is_a_public_snapshot(client):
    signup(client)
    cid, _ = _chat(client, "first question")
    tok = client.post(f"/api/conversations/{cid}/share").json()["token"]
    assert client.get(f"/api/conversations/{cid}").json()["share"]["token"] == tok
    _chat(client, "private follow-up", cid)
    client.cookies.clear()  # logged out visitors can read it
    shared = client.get(f"/api/shared/{tok}").json()
    assert [m["role"] for m in shared["messages"]] == ["user", "assistant"]
    assert "private follow-up" not in json.dumps(shared)
    assert "reasoning" not in shared["messages"][1]
    signup(client, "b@example.com")
    assert client.post(f"/api/conversations/{cid}/share").status_code == 404  # not yours
    client.cookies.clear()
    client.post("/api/auth/login", json={"email": "user@example.com", "password": "password123"})
    assert client.post(f"/api/conversations/{cid}/share").json()["token"] == tok  # same link, new snapshot
    client.delete(f"/api/conversations/{cid}/share")
    assert client.get(f"/api/shared/{tok}").status_code == 404


def test_memory_event_and_edit(client, monkeypatch):
    from app import llm
    real = llm.complete_chat

    async def fake(body):
        if "long-term memory" in body["messages"][0]["content"]:
            return {"choices": [{"message": {"content": '["Is a teacher"]'}}]}
        return await real(body)
    monkeypatch.setattr(llm, "complete_chat", fake)
    signup(client)
    _, ev = _chat(client, "I am a teacher, help me plan a lesson")
    assert {"t": "memory", "v": ["Is a teacher"]} in ev
    m = client.get("/api/memories").json()["memories"][0]
    assert client.patch(f"/api/memories/{m['id']}", json={"content": "Is a math teacher"}).json()["content"] == "Is a math teacher"


def test_gate_is_wider():
    from app import memory
    assert memory.looks_personal("we have two kids")
    assert memory.looks_personal("İstanbul'da çalışıyorum")
    assert memory.looks_personal("prefer short answers please")
    assert not memory.looks_personal("What is the capital of France?")


def test_training_opt_in_and_export(client):
    u = signup(client)
    assert u["training_opt_in"] is False
    _chat(client, "not shared for training")
    client.cookies.clear()
    r = client.post("/api/auth/signup", json={"email": "yes@example.com", "password": "password123", "training_opt_in": True})
    assert r.json()["training_opt_in"] is True
    _chat(client, "fine to train on this")
    client.cookies.clear()
    client.post("/api/auth/login", json={"email": "user@example.com", "password": "password123"})
    assert client.get("/api/admin/training/export").status_code == 403  # admins only
    assert client.put("/api/settings/training", json={"enabled": True}).json() == {"enabled": True}
    client.cookies.clear()
    client.post("/api/auth/login", json={"email": "admin@example.com", "password": "adminpass123"})
    st = client.get("/api/admin/training/stats").json()
    assert st["users_opted_in"] == 2 and st["conversations"] == 2
    r = client.get("/api/admin/training/export")
    assert "attachment" in r.headers["content-disposition"]
    rows = [json.loads(l) for l in r.text.splitlines()]
    assert len(rows) == 2
    msgs = rows[0]["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant"] and msgs[1]["thinking"]
    assert "@" not in r.text  # no emails
    r = client.get("/api/admin/training/export?reasoning=false")
    assert "thinking" not in r.text
