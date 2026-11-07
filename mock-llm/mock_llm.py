"""Fake OpenAI-compatible model server that behaves like llama.cpp + gpt-oss.
Used for local development on a machine without a GPU, and by the test-suite.

Run: python mock-llm/mock_llm.py   (listens on :9000)
"""
import asyncio
import json
import os
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI()
DELAY = float(os.environ.get("MOCK_DELAY", "0.02"))


def reply_for(messages: list[dict]) -> tuple[str, str]:
    last = next((m.get("content") for m in reversed(messages) if m.get("role") == "user"), "") or ""
    if isinstance(last, list):  # content parts
        last = " ".join(p.get("text", "") for p in last if isinstance(p, dict))
    reasoning = f"The user said: {last[:80]!r}. I'll answer briefly (mock model)."
    content = (f"**Mock reply** to: _{last[:200]}_\n\nHere is some code:\n\n"
               "```python\ndef hello():\n    print(\"hello from the mock model\")\n```\n")
    return reasoning, content


def words(text: str):
    parts = text.split(" ")
    for i, p in enumerate(parts):
        yield p + (" " if i < len(parts) - 1 else "")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/v1/chat/completions")
async def chat(request: Request):
    body = await request.json()
    reasoning, content = reply_for(body.get("messages", []))
    created, cid = int(time.time()), "chatcmpl-mock"
    pt = len(json.dumps(body.get("messages", []))) // 4
    ct = (len(reasoning) + len(content)) // 4
    usage = {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": pt + ct}

    if not body.get("stream"):
        return JSONResponse({
            "id": cid, "object": "chat.completion", "created": created, "model": body.get("model"),
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": content, "reasoning_content": reasoning}}],
            "usage": usage})

    def chunk(delta, finish=None, with_usage=False):
        c = {"id": cid, "object": "chat.completion.chunk", "created": created, "model": body.get("model"),
             "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
        if with_usage:
            c["choices"] = []
            c["usage"] = usage
        return f"data: {json.dumps(c)}\n\n"

    async def gen():
        yield chunk({"role": "assistant", "content": None})
        for w in words(reasoning):
            await asyncio.sleep(DELAY)
            yield chunk({"reasoning_content": w})
        for w in words(content):
            await asyncio.sleep(DELAY)
            yield chunk({"content": w})
        yield chunk({}, finish="stop")
        if (body.get("stream_options") or {}).get("include_usage"):
            yield chunk({}, with_usage=True)
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "9000")))
