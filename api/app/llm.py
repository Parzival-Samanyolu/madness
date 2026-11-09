"""Talks to the model server (llama.cpp in production, mock-llm in dev).

If the GPU box is offline and FALLBACK_LLM_API_KEY is set, requests go to the fallback
server (OpenRouter free models) instead, and switch back by themselves once the GPU box is up.
"""
import json
import time
from collections.abc import AsyncIterator

import httpx

from .config import get_settings

_transport: httpx.AsyncBaseTransport | None = None  # tests inject an ASGI transport


def set_transport(t: httpx.AsyncBaseTransport | None):
    global _transport
    _transport = t


def client(fallback: bool = False) -> httpx.AsyncClient:
    s = get_settings()
    if fallback:
        url, key = s.fallback_llm_url, s.fallback_llm_api_key
        extra = {"X-Title": s.app_name}
    else:
        url, key, extra = s.llm_url, s.llm_api_key, {}
    return httpx.AsyncClient(
        base_url=url,
        headers={**extra, **({"Authorization": f"Bearer {key}"} if key else {})},
        transport=_transport,
        timeout=httpx.Timeout(connect=10, read=600, write=60, pool=60),
    )


_primary_cache = {"ok": False, "at": 0.0}


async def use_fallback() -> bool:
    """True when the GPU box is offline and a fallback is configured (health checked at most every 15s)."""
    if not get_settings().fallback_llm_api_key:
        return False
    now = time.monotonic()
    if now - _primary_cache["at"] > 15:
        _primary_cache["ok"], _primary_cache["at"] = await health(), now
    return not _primary_cache["ok"]


def for_fallback(body: dict) -> dict:
    """Turn a llama.cpp-style request into an OpenRouter one."""
    out = dict(body)
    models = [m.strip() for m in get_settings().fallback_models.split(",") if m.strip()]
    out["model"] = models[0]
    if len(models) > 1:
        out["models"] = models  # OpenRouter tries these in order
    kw = out.pop("chat_template_kwargs", None) or {}
    effort = kw.get("reasoning_effort") or out.pop("reasoning_effort", None)
    out.pop("reasoning_effort", None)
    if effort in ("low", "medium", "high"):
        out["reasoning"] = {"effort": effort}
    return out


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def prepare_body(body: dict, max_output_tokens: int) -> dict:
    """Normalise an OpenAI-style request for the model server."""
    out = dict(body)
    out["model"] = get_settings().model_name
    requested = out.get("max_completion_tokens") or out.get("max_tokens") or max_output_tokens
    out["max_tokens"] = min(int(requested), max_output_tokens)
    out.pop("max_completion_tokens", None)
    effort = out.get("reasoning_effort")
    if effort in ("low", "medium", "high"):
        # gpt-oss reads reasoning effort from its chat template
        kw = dict(out.get("chat_template_kwargs") or {})
        kw["reasoning_effort"] = effort
        out["chat_template_kwargs"] = kw
    if out.get("stream"):
        out["stream_options"] = {"include_usage": True}
    return out


class StreamResult:
    def __init__(self):
        self.content = ""
        self.reasoning = ""
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.got_usage = False

    def finalize(self, prompt_text: str):
        if not self.got_usage:
            self.prompt_tokens = estimate_tokens(prompt_text)
            self.completion_tokens = estimate_tokens(self.content + self.reasoning)


async def stream_chat(body: dict, result: StreamResult) -> AsyncIterator[bytes]:
    """Yields raw SSE lines from the model server while collecting text + usage."""
    fb = await use_fallback()
    async with client(fb) as c:
        async with c.stream("POST", "/v1/chat/completions", json=for_fallback(body) if fb else body) as r:
            if r.status_code != 200:
                text = (await r.aread()).decode(errors="replace")[:500]
                raise LLMError(r.status_code, text)
            async for line in r.aiter_lines():
                if not line or line.startswith(":"):  # skip blank lines and keep-alive comments
                    continue
                if line.startswith("data:"):
                    data = line[5:].strip()
                    if data != "[DONE]":
                        _collect(data, result)
                yield (line + "\n\n").encode()


def rename_model(line: bytes, name: str) -> bytes:
    """Replace the real model name in a streamed chunk with the public one."""
    if not line.startswith(b"data:") or line.startswith(b"data: [DONE]"):
        return line
    try:
        chunk = json.loads(line[5:])
    except ValueError:
        return line
    if isinstance(chunk, dict) and "model" in chunk:
        chunk["model"] = name
        return f"data: {json.dumps(chunk)}\n\n".encode()
    return line


def _collect(data: str, result: StreamResult):
    try:
        chunk = json.loads(data)
    except ValueError:
        return
    usage = chunk.get("usage")
    if usage:
        result.prompt_tokens = usage.get("prompt_tokens", 0)
        result.completion_tokens = usage.get("completion_tokens", 0)
        result.got_usage = True
    for choice in chunk.get("choices") or []:
        delta = choice.get("delta") or {}
        result.content += delta.get("content") or ""
        result.reasoning += delta.get("reasoning_content") or delta.get("reasoning") or ""


async def complete_chat(body: dict) -> dict:
    fb = await use_fallback()
    async with client(fb) as c:
        r = await c.post("/v1/chat/completions", json=for_fallback(body) if fb else body)
        if r.status_code != 200:
            raise LLMError(r.status_code, r.text[:500])
        return r.json()


async def health() -> bool:
    try:
        async with client() as c:
            r = await c.get("/health", timeout=5)
            return r.status_code == 200
    except httpx.HTTPError:
        return False


class LLMError(Exception):
    def __init__(self, status: int, text: str):
        super().__init__(f"model server error {status}: {text}")
        self.status = status
        self.text = text
