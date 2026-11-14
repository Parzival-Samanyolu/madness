import json

from conftest import make_key, signup


def test_key_lifecycle_and_revoke(client):
    signup(client)
    key = make_key(client)
    assert key.startswith("syn_sk_")
    listed = client.get("/api/keys").json()
    assert len(listed) == 1 and "key" not in listed[0]
    h = {"Authorization": f"Bearer {key}"}
    assert client.get("/v1/models", headers=h).json()["data"][0]["id"] == "synapse-2"
    client.delete(f"/api/keys/{listed[0]['id']}")
    r = client.get("/v1/models", headers=h)
    assert r.status_code == 401 and "error" in r.json()


def test_no_key(client):
    r = client.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 401
    assert client.get("/v1/models", headers={"Authorization": "Bearer syn_sk_fake"}).status_code == 401


def test_chat_completion_non_stream(client):
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    r = client.post("/v1/chat/completions", headers=h, json={
        "model": "anything", "max_tokens": 999999, "messages": [{"role": "user", "content": "hello"}]})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "Mock reply" in data["choices"][0]["message"]["content"]
    assert data["model"] == "synapse-2"
    assert client.get("/api/auth/me").json()["tokens_used_today"] > 0


def test_chat_completion_stream(client):
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    with client.stream("POST", "/v1/chat/completions", headers=h, json={
            "stream": True, "messages": [{"role": "user", "content": "stream me"}]}) as r:
        assert r.status_code == 200
        lines = [l for l in r.iter_lines() if l.startswith("data:")]
    assert lines[-1] == "data: [DONE]"
    text = "".join((json.loads(l[5:])["choices"] or [{}])[0].get("delta", {}).get("content") or ""
                   for l in lines[:-1])
    assert "stream me" in text
    usage = client.get("/api/usage?days=1").json()
    assert usage[-1]["api_tokens"] > 0


def test_rate_limit_rpm(client):
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    body = {"messages": [{"role": "user", "content": "x"}]}
    codes = [client.post("/v1/chat/completions", headers=h, json=body).status_code for _ in range(11)]
    assert codes[:10] == [200] * 10 and codes[10] == 429


def test_daily_token_quota(client):
    from app import limits
    me = signup(client)
    limits.add_tokens(me["id"], 200_000)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    r = client.post("/v1/chat/completions", headers=h, json={"messages": [{"role": "user", "content": "x"}]})
    assert r.status_code == 429
    assert "Daily token limit" in r.json()["error"]["message"]


def test_bad_body(client):
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    assert client.post("/v1/chat/completions", headers=h, json={"messages": []}).status_code == 400


def test_prepare_body_clamps_and_reasoning():
    from app.llm import prepare_body
    b = prepare_body({"max_tokens": 10**6, "reasoning_effort": "high", "stream": True, "messages": []}, 4096)
    assert b["max_tokens"] == 4096
    assert b["chat_template_kwargs"]["reasoning_effort"] == "high"
    assert b["stream_options"] == {"include_usage": True}


def test_prompt_too_long(client):
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    big = "word " * 40_000  # ~50k tokens > free plan's 32k
    r = client.post("/v1/chat/completions", headers=h, json={"messages": [{"role": "user", "content": big}]})
    assert r.status_code == 400 and "too long" in r.json()["error"]["message"]
    # slot was released, normal request still works
    ok = client.post("/v1/chat/completions", headers=h, json={"messages": [{"role": "user", "content": "hi"}]})
    assert ok.status_code == 200


def test_stream_hides_real_model_name(client):
    import json
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    with client.stream("POST", "/v1/chat/completions", headers=h,
                       json={"model": "synapse-2", "stream": True, "reasoning_effort": "low",
                             "messages": [{"role": "user", "content": "hi"}]}) as r:
        chunks = [json.loads(l[5:]) for l in r.iter_lines() if l.startswith("data:") and "[DONE]" not in l]
    assert chunks and all(c.get("model", "synapse-2") == "synapse-2" for c in chunks)


def test_models_show_plan_limits(client):
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    m = client.get("/v1/models", headers=h).json()["data"][0]
    assert m["context_length"] == 32_000 and m["max_output_tokens"] == 4096 and m["max_concurrent"] == 1
    assert m["pricing"] == {"prompt": "0", "completion": "0"}
    assert "tools" in m["supported_parameters"]


def test_key_info(client):
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    client.post("/v1/chat/completions", headers=h, json={"messages": [{"role": "user", "content": "hello"}]})
    d = client.get("/v1/key", headers=h).json()["data"]
    assert d["plan"] == "free" and d["limits"]["max_concurrent"] == 1
    assert d["usage"]["tokens_today"] > 0 and d["usage"]["resets_at"] > 0
    assert client.get("/v1/key").status_code == 401


def test_rate_limit_has_retry_after(client, monkeypatch):
    from app.config import PLANS
    monkeypatch.setattr(PLANS["free"], "requests_per_minute", 1)
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    body = {"messages": [{"role": "user", "content": "hello"}]}
    assert client.post("/v1/chat/completions", headers=h, json=body).status_code == 200
    r = client.post("/v1/chat/completions", headers=h, json=body)
    assert r.status_code == 429 and r.json()["error"]["type"] == "rate_limit_error"
    assert 1 <= int(r.headers["retry-after"]) <= 61
