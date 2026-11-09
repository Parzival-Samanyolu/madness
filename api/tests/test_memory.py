import asyncio
import json

import httpx

from conftest import signup


def _send(client, cid, text):
    with client.stream("POST", f"/api/conversations/{cid}/messages", json={"content": text}) as r:
        r.read()


def test_memory_crud_and_toggle(client):
    signup(client)
    assert client.get("/api/memories").json() == {"enabled": True, "memories": []}
    m = client.post("/api/memories", json={"content": "Name is Murad"}).json()
    client.post("/api/memories", json={"content": "Likes Python"})
    assert [x["content"] for x in client.get("/api/memories").json()["memories"]] == ["Likes Python", "Name is Murad"]
    assert client.delete(f"/api/memories/{m['id']}").status_code == 200
    assert client.put("/api/memories/settings", json={"enabled": False}).json() == {"enabled": False}
    assert client.delete("/api/memories").status_code == 200
    assert client.get("/api/memories").json() == {"enabled": False, "memories": []}


def test_cannot_touch_other_users_memories(client):
    signup(client, "a@example.com")
    m = client.post("/api/memories", json={"content": "secret fact"}).json()
    client.cookies.clear()
    signup(client, "b@example.com")
    assert client.delete(f"/api/memories/{m['id']}").status_code == 404
    assert client.get("/api/memories").json()["memories"] == []


def test_memories_go_into_system_prompt_only_when_enabled(client):
    from app import llm
    sent = []

    def handler(request):
        if request.url.path == "/health":
            return httpx.Response(200)
        sent.append(json.loads(request.content))
        chunk = {"choices": [{"delta": {"content": "ok"}}]}
        return httpx.Response(200, text=f"data: {json.dumps(chunk)}\n\ndata: [DONE]\n\n",
                              headers={"content-type": "text/event-stream"})
    llm.set_transport(httpx.MockTransport(handler))
    signup(client)
    client.post("/api/memories", json={"content": "Has a cat named Pamuk"})
    cid = client.post("/api/conversations").json()["id"]
    _send(client, cid, "what should I feed it?")
    assert "Has a cat named Pamuk" in sent[-1]["messages"][0]["content"]
    client.put("/api/memories/settings", json={"enabled": False})
    _send(client, cid, "and how often?")
    chat_reqs = [b for b in sent if b.get("stream")]
    assert "Pamuk" not in chat_reqs[-1]["messages"][0]["content"]


def test_extraction_saves_new_facts(client, monkeypatch):
    from app import llm, memory
    u = signup(client)

    async def fake_complete(body):
        assert "Already known" in body["messages"][0]["content"]
        return {"choices": [{"message": {"content": 'Sure: ["Name is Murad", "Works as a teacher", "Name is Murad"]'}}]}
    monkeypatch.setattr(llm, "complete_chat", fake_complete)
    client.post("/api/memories", json={"content": "Name is Murad"})
    asyncio.run(memory.extract_and_save(u["id"], "My name is Murad and I work as a teacher"))
    facts = [m["content"] for m in client.get("/api/memories").json()["memories"]]
    assert sorted(facts) == ["Name is Murad", "Works as a teacher"]


def test_gate_and_parser():
    from app import memory
    assert memory.looks_personal("My name is Murad")
    assert memory.looks_personal("Benim adım Murad")
    assert memory.looks_personal("Mənim adım Murad")
    assert not memory.looks_personal("Explain how HTTPS works")
    assert memory.parse_facts('```json\n["a", "b"]\n```') == ["a", "b"]
    assert memory.parse_facts("nothing here") == []
    assert memory.parse_facts("[1, 2]") == []
