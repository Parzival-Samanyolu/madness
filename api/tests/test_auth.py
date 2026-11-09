from conftest import signup


def test_signup_login_logout(client):
    u = signup(client)
    assert u["email"] == "user@example.com" and u["plan"]["name"] == "free"
    assert client.get("/api/auth/me").status_code == 200
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": "user@example.com", "password": "nope"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "USER@example.com", "password": "password123"})
    assert r.status_code == 200


def test_duplicate_and_validation(client):
    signup(client)
    client.cookies.clear()
    assert client.post("/api/auth/signup", json={"email": "user@example.com", "password": "password123"}).status_code == 409
    assert client.post("/api/auth/signup", json={"email": "bad", "password": "password123"}).status_code == 400
    assert client.post("/api/auth/signup", json={"email": "a@b.co", "password": "short"}).status_code == 400


def test_signup_rate_limited_per_ip(client):
    for i in range(5):
        client.cookies.clear()
        signup(client, email=f"u{i}@example.com")
    client.cookies.clear()
    r = client.post("/api/auth/signup", json={"email": "u9@example.com", "password": "password123"})
    assert r.status_code == 429


def test_admin_bootstrap_and_ban(client):
    signup(client)
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"email": "admin@example.com", "password": "adminpass123"}).status_code == 200
    users = client.get("/api/admin/users").json()
    victim = next(u for u in users if u["email"] == "user@example.com")
    assert client.patch(f"/api/admin/users/{victim['id']}", json={"is_banned": True}).status_code == 200
    assert client.get("/api/admin/stats").json()["users"] == 2
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"email": "user@example.com", "password": "password123"}).status_code == 403


def test_non_admin_forbidden(client):
    signup(client)
    assert client.get("/api/admin/users").status_code == 403


def test_change_password(client):
    from conftest import signup
    signup(client, "pw@example.com", "password123")
    r = client.post("/api/auth/password", json={"current_password": "wrong", "new_password": "newpass123"})
    assert r.status_code == 400
    r = client.post("/api/auth/password", json={"current_password": "password123", "new_password": "short"})
    assert r.status_code == 400
    r = client.post("/api/auth/password", json={"current_password": "password123", "new_password": "newpass123"})
    assert r.status_code == 200
    assert client.get("/api/auth/me").status_code == 200  # this device stays logged in
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"email": "pw@example.com", "password": "password123"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "pw@example.com", "password": "newpass123"}).status_code == 200
