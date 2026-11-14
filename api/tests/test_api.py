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
    codes = [client.post("/v1/chat/completions", headers=h, json=body).status_code for _ in range(21)]
    assert codes[:20] == [200] * 20 and codes[20] == 429


def test_weekly_usage_limit(client):
    from app import limits
    me = signup(client)
    limits.add_usage(me["id"], limits.plan_for("free"), 10_000_000, 0)  # $10 at $1 per million
    h = {"Authorization": f"Bearer {make_key(client)}"}
    r = client.post("/v1/chat/completions", headers=h, json={"messages": [{"role": "user", "content": "x"}]})
    assert r.status_code == 429
    assert "Weekly usage limit" in r.json()["error"]["message"]
    assert int(r.headers["retry-after"]) <= 7 * 86400


def test_cached_tokens_cost_a_tenth():
    from app import limits
    plan = limits.plan_for("free")
    assert limits.cost_usd(plan, 1_000_000, 0) == 1.0
    assert abs(limits.cost_usd(plan, 1_000_000, 0, cached_tokens=1_000_000) - 0.10) < 1e-9
    assert abs(limits.cost_usd(plan, 1_000_000, 1_000_000, cached_tokens=500_000) - 1.55) < 1e-9


def test_cached_tokens_from_usage():
    from app.llm import cached_tokens
    assert cached_tokens({"prompt_tokens_details": {"cached_tokens": 300}}) == 300
    assert cached_tokens({}, {"timings": {"cache_n": 42}}) == 42
    assert cached_tokens({}) == 0


def test_bad_body(client):
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    assert client.post("/v1/chat/completions", headers=h, json={"messages": []}).status_code == 400


def test_prepare_body_clamps_and_reasoning():
    from app.llm import prepare_body
    b = prepare_body({"max_tokens": 10**6, "reasoning_effort": "high", "stream": True, "messages": []}, 4096)
    assert b["max_tokens"] == 4096
    assert b["chat_template_kwargs"] == {"enable_thinking": True}
    assert "thinking_budget_tokens" not in b and "reasoning_effort" not in b
    assert b["stream_options"] == {"include_usage": True}


def test_modes_map_to_thinking():
    from app.llm import for_fallback, prepare_body
    low = prepare_body({"reasoning_effort": "low", "messages": []}, 8192)
    assert low["chat_template_kwargs"] == {"enable_thinking": False} and "thinking_budget_tokens" not in low
    med = prepare_body({"reasoning_effort": "medium", "messages": []}, 8192)
    assert med["chat_template_kwargs"] == {"enable_thinking": True} and med["thinking_budget_tokens"] == 4096
    # the budget never takes more than half of a small answer limit
    assert prepare_body({"reasoning_effort": "medium", "max_tokens": 1000, "messages": []}, 8192)["thinking_budget_tokens"] == 500
    # the OpenRouter fallback gets the original mode back
    for effort in ("low", "medium", "high"):
        fb = for_fallback(prepare_body({"reasoning_effort": effort, "messages": []}, 8192))
        assert fb["reasoning"] == {"effort": effort}
        assert "chat_template_kwargs" not in fb and "thinking_budget_tokens" not in fb


def test_prompt_too_long(client):
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    big = "word " * 110_000  # ~137k tokens > the plans' 128k
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
    assert m["context_length"] == 128_000 and m["max_output_tokens"] == 8192 and m["max_concurrent"] == 1
    assert m["pricing"] == {"prompt": "0.000001", "completion": "0.000001", "input_cache_read": "0.0000001"}
    assert "tools" in m["supported_parameters"]


def test_key_info(client):
    signup(client)
    h = {"Authorization": f"Bearer {make_key(client)}"}
    client.post("/v1/chat/completions", headers=h, json={"messages": [{"role": "user", "content": "hello"}]})
    d = client.get("/v1/key", headers=h).json()["data"]
    assert d["plan"] == "free" and d["plan_label"] == "Neuron" and d["limits"]["max_concurrent"] == 1
    assert d["limits"]["usd_per_week"] == 10 and d["limits"]["cache_price_per_million_usd"] == 0.1
    assert d["usage"]["tokens_today"] > 0 and d["usage"]["usd_this_week"] > 0 and d["usage"]["resets_at"] > 0
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


def test_contact_form_and_admin_inbox(client):
    r = client.post("/api/contact", json={"name": "Ada", "email": "ada@example.com", "topic": "myelin",
                                          "message": "I'd like Myelin"})
    assert r.status_code == 200
    assert client.post("/api/contact", json={"name": "x", "email": "nope", "message": "m"}).status_code == 422
    assert client.get("/api/admin/messages").status_code == 401
    assert client.post("/api/auth/login", json={"email": "admin@example.com", "password": "adminpass123"}).status_code == 200
    msgs = client.get("/api/admin/messages").json()
    assert msgs[0]["name"] == "Ada" and msgs[0]["handled"] is False
    assert client.patch(f"/api/admin/messages/{msgs[0]['id']}", json={"handled": True}).json()["handled"] is True


def test_usage_cost_is_ours():
    from app import limits, llm
    plan = limits.plan_for("free")
    line = ('data: ' + json.dumps({"model": "real-model", "provider": "Nvidia", "choices": [],
            "usage": {"prompt_tokens": 1_000_000, "completion_tokens": 0, "cost": 0, "is_byok": False,
                      "prompt_tokens_details": {"cached_tokens": 1_000_000}}})).encode()
    out = json.loads(llm.rename_model(line, "synapse-2", lambda p, c, k: limits.cost_usd(plan, p, c, k))[5:])
    assert out["model"] == "synapse-2" and "provider" not in out and "is_byok" not in out["usage"]
    assert abs(out["usage"]["cost"] - 0.10) < 1e-9
