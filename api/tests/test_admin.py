from conftest import make_key, signup


def admin_login(client):
    client.cookies.clear()
    r = client.post("/api/auth/login", json={"email": "admin@example.com", "password": "adminpass123"})
    assert r.status_code == 200, r.text


def _chat(client):
    cid = client.post("/api/conversations").json()["id"]
    with client.stream("POST", f"/api/conversations/{cid}/messages", json={"content": "hello"}) as r:
        r.read()


def test_admin_overview_users_detail_activity_system(client):
    u = signup(client, "someone@example.com")
    _chat(client)
    make_key(client)
    admin_login(client)

    s = client.get("/api/admin/stats").json()
    assert s["users"] == 2 and s["tokens_24h"] > 0 and s["active_users_24h"] == 1
    assert len(s["daily"]) == 30 and s["daily"][-1]["web_tokens"] > 0 and s["daily"][-1]["signups"] == 2
    assert s["top_users_7d"][0]["email"] == "someone@example.com"

    rows = client.get("/api/admin/users?q=someone").json()
    assert len(rows) == 1 and rows[0]["conversations"] == 1 and rows[0]["api_keys"] == 1 and rows[0]["tokens_total"] > 0

    d = client.get(f"/api/admin/users/{u['id']}").json()
    assert d["messages"] == 2 and d["sessions"] == 1 and len(d["api_keys"]) == 1 and len(d["daily"]) == 30

    a = client.get("/api/admin/activity").json()
    assert a["requests"][0]["email"] == "someone@example.com" and a["signups"]

    sysinfo = client.get("/api/admin/system").json()
    assert sysinfo["public_model"] == "synapse-2" and sysinfo["serving"] in ("gpu", "offline")


def test_admin_actions(client):
    u = signup(client, "victim@example.com")
    key = make_key(client)
    admin_login(client)
    assert client.post(f"/api/admin/users/{u['id']}/revoke-keys").json()["keys_revoked"] == 1
    assert client.get("/v1/models", headers={"Authorization": f"Bearer {key}"}).status_code == 401
    assert client.post(f"/api/admin/users/{u['id']}/logout").json()["sessions_ended"] == 1
    temp = client.post(f"/api/admin/users/{u['id']}/reset-password").json()["temporary_password"]
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"email": "victim@example.com", "password": temp}).status_code == 200


def test_admin_only(client):
    signup(client)
    assert client.get("/api/admin/stats").status_code == 403
    assert client.get("/api/admin/system").status_code == 403
