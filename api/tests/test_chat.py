import json

from conftest import signup


def events(r):
    return [json.loads(l[5:]) for l in r.iter_lines() if l.startswith("data:")]


def test_web_chat_saves_history(client):
    signup(client)
    conv = client.post("/api/conversations").json()
    with client.stream("POST", f"/api/conversations/{conv['id']}/messages",
                       json={"content": "Write hello world", "reasoning_effort": "low"}) as r:
        assert r.status_code == 200
        ev = events(r)
    kinds = {e["t"] for e in ev}
    assert {"title", "r", "c", "done"} <= kinds
    full = client.get(f"/api/conversations/{conv['id']}").json()
    assert full["title"] == "Write hello world"
    assert [m["role"] for m in full["messages"]] == ["user", "assistant"]
    assert "Mock reply" in full["messages"][1]["content"]
    assert full["messages"][1]["reasoning"]
    assert client.get("/api/usage?days=1").json()[-1]["web_tokens"] > 0


def test_other_users_cannot_read(client):
    signup(client, "a@example.com")
    conv = client.post("/api/conversations").json()
    client.cookies.clear()
    signup(client, "b@example.com")
    assert client.get(f"/api/conversations/{conv['id']}").status_code == 404


def test_model_offline_reports_error(client):
    import httpx
    from app import llm

    def boom(request):
        raise httpx.ConnectError("down")
    llm.set_transport(httpx.MockTransport(boom))
    signup(client)
    conv = client.post("/api/conversations").json()
    with client.stream("POST", f"/api/conversations/{conv['id']}/messages", json={"content": "hi"}) as r:
        ev = events(r)
    assert any(e["t"] == "error" for e in ev)
    # slot released: a second message isn't blocked by the concurrency limit
    with client.stream("POST", f"/api/conversations/{conv['id']}/messages", json={"content": "hi"}) as r:
        assert r.status_code == 200


def test_context_compression_at_80_percent(client, monkeypatch):
    from app.config import PLANS
    # tiny plan so a few messages cross 80% of the budget
    monkeypatch.setattr(PLANS["free"], "max_context_tokens", 700)
    monkeypatch.setattr(PLANS["free"], "max_output_tokens", 200)
    signup(client)
    conv = client.post("/api/conversations").json()
    seen = []
    for i in range(6):
        with client.stream("POST", f"/api/conversations/{conv['id']}/messages",
                           json={"content": f"message {i} " + "lorem ipsum " * 25}) as r:
            seen.append([e["t"] for e in events(r)])
    assert any("compressed" in s for s in seen), seen
    assert "compressed" not in seen[0]  # first message never compresses
    full = client.get(f"/api/conversations/{conv['id']}").json()
    assert full["context"]["summary_upto"] > 0
    assert full["context"]["used"] < full["context"]["limit"]
    # history is kept in full for the user even though the model only sees the summary + recent part
    assert len(full["messages"]) == 12
