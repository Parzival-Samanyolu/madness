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


def _send(client, cid, **body):
    with client.stream("POST", f"/api/conversations/{cid}/messages", json=body) as r:
        assert r.status_code == 200, r.read()
        return events(r)


def test_regenerate_replaces_last_answer(client):
    signup(client)
    cid = client.post("/api/conversations").json()["id"]
    _send(client, cid, content="first")
    _send(client, cid, content="second")
    ev = _send(client, cid, regenerate=True)
    assert any(e["t"] == "c" for e in ev)
    after = client.get(f"/api/conversations/{cid}").json()["messages"]
    assert [m["role"] for m in after] == ["user", "assistant", "user", "assistant"]
    assert after[2]["content"] == "second"


def test_edit_message_drops_everything_after(client):
    signup(client)
    cid = client.post("/api/conversations").json()["id"]
    _send(client, cid, content="first")
    _send(client, cid, content="second")
    first_id = client.get(f"/api/conversations/{cid}").json()["messages"][0]["id"]
    _send(client, cid, content="first, edited", edit_message_id=first_id)
    msgs = client.get(f"/api/conversations/{cid}").json()["messages"]
    assert [m["content"] for m in msgs if m["role"] == "user"] == ["first, edited"]
    assert len(msgs) == 2


def test_empty_message_rejected(client):
    signup(client)
    cid = client.post("/api/conversations").json()["id"]
    r = client.post(f"/api/conversations/{cid}/messages", json={"content": "  "})
    assert r.status_code == 422


def test_system_prompt_identity():
    from app.routers.chat import system_prompt
    p = system_prompt()
    assert "Synapse" in p and "Samanyolu AI" in p and "same language" in p


def test_fallback_to_openrouter_when_gpu_offline(client, monkeypatch):
    import httpx
    from app import config, llm
    monkeypatch.setenv("FALLBACK_LLM_API_KEY", "sk-or-test")
    monkeypatch.setenv("FALLBACK_MODELS", "small/model-a:free,small/model-b:free")
    config.get_settings.cache_clear()
    llm._primary_cache["at"] = 0
    seen = []

    def handler(request):
        if request.url.path == "/health":
            return httpx.Response(503)  # GPU box offline
        seen.append((request.url.host, request.headers.get("authorization"), json.loads(request.content)))
        chunks = [{"model": "small/model-a:free", "choices": [{"delta": {"reasoning": "hmm "}}]},
                  {"model": "small/model-a:free", "choices": [{"delta": {"content": "Hi from backup"}}]}]
        body = ": OPENROUTER PROCESSING\n\n" + "".join(f"data: {json.dumps(c)}\n\n" for c in chunks) + "data: [DONE]\n\n"
        return httpx.Response(200, text=body, headers={"content-type": "text/event-stream"})
    llm.set_transport(httpx.MockTransport(handler))
    signup(client)
    cid = client.post("/api/conversations").json()["id"]
    _send(client, cid, content="hello", reasoning_effort="high")
    host, auth, body = seen[0]
    assert host == "openrouter.ai" and auth == "Bearer sk-or-test"
    assert body["model"] == "small/model-a:free" and body["models"] == ["small/model-a:free", "small/model-b:free"]
    assert body["reasoning"] == {"effort": "high"} and "chat_template_kwargs" not in body
    msgs = client.get(f"/api/conversations/{cid}").json()["messages"]
    assert msgs[1]["content"] == "Hi from backup" and msgs[1]["reasoning"] == "hmm "


def test_no_fallback_without_key(client):
    import asyncio
    from app import llm
    assert asyncio.run(llm.use_fallback()) is False
