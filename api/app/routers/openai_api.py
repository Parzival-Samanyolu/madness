"""OpenAI-compatible developer API: point any OpenAI SDK at https://<site>/v1"""
import json
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from .. import limits, llm
from ..config import get_settings
from ..db import SessionLocal, get_db
from ..models import ApiKey, User
from ..security import api_key_user
from ..usage import record, record_stream

router = APIRouter(prefix="/v1", tags=["openai"])


def oai_error(status: int, message: str, type_: str = "server_error"):
    return JSONResponse({"error": {"message": message, "type": type_}}, status_code=status)


SUPPORTED_PARAMETERS = ["tools", "tool_choice", "reasoning", "reasoning_effort", "max_tokens", "temperature",
                        "top_p", "stop", "stream"]


def _per_token(per_million: float) -> str:
    return f"{per_million / 1_000_000:.10f}".rstrip("0").rstrip(".")


@router.get("/models")
def models(auth: tuple[User, ApiKey] = Depends(api_key_user)):
    """The model, with the limits of the key owner's plan (OpenRouter-style fields)."""
    s = get_settings()
    plan = limits.plan_for(auth[0].plan)
    return {"object": "list", "data": [{
        "id": s.public_model, "object": "model", "created": 1762646400,
        "owned_by": s.company_name.lower().replace(" ", "-"),
        "name": f"{s.app_name} {s.public_model.rsplit('-', 1)[-1]}",
        "context_length": plan.max_context_tokens,
        "max_output_tokens": plan.max_output_tokens,
        "max_concurrent": plan.max_concurrent,
        # USD per token, measured against the plan's weekly allowance (nothing is billed per token)
        "pricing": {"prompt": _per_token(plan.price_per_million_usd),
                    "completion": _per_token(plan.price_per_million_usd),
                    "input_cache_read": _per_token(plan.cache_price_per_million_usd)},
        "supported_parameters": SUPPORTED_PARAMETERS,
        "reasoning_efforts": ["low", "medium", "high"],
        "architecture": {"input_modalities": ["text"], "output_modalities": ["text"]},
    }]}


@router.get("/key")
def key_info(auth: tuple[User, ApiKey] = Depends(api_key_user)):
    """The key's plan, limits and today's token use, so apps can show them without a website login."""
    user, key = auth
    plan = limits.plan_for(user.plan)
    reset = int(time.time()) + limits.seconds_until_week_reset()
    return {"data": {
        "label": key.name,
        "plan": plan.name,
        "plan_label": plan.label,
        "limits": {
            "requests_per_minute": plan.requests_per_minute,
            "usd_per_week": plan.usd_per_week,
            "price_per_million_usd": plan.price_per_million_usd,
            "cache_price_per_million_usd": plan.cache_price_per_million_usd,
            "max_output_tokens": plan.max_output_tokens,
            "max_concurrent": plan.max_concurrent,
            "max_context_tokens": plan.max_context_tokens,
        },
        "usage": {"usd_this_week": round(limits.usd_used_this_week(user.id), 4),
                  "tokens_today": limits.tokens_used_today(user.id), "resets_at": reset},
    }}


def identity_message() -> dict:
    s = get_settings()
    return {"role": "system", "content": f"You are {s.app_name} ({s.public_model}), a model made by "
                                         f"{s.company_name}. If asked who made you, say {s.company_name}."}


@router.post("/chat/completions")
async def chat_completions(request: Request, auth: tuple[User, ApiKey] = Depends(api_key_user),
                           db: Session = Depends(get_db)):
    user, key = auth
    try:
        body = await request.json()
    except ValueError:
        return oai_error(400, "Request body must be JSON", "invalid_request_error")
    if not isinstance(body, dict) or not isinstance(body.get("messages"), list) or not body["messages"]:
        return oai_error(400, "'messages' must be a non-empty array", "invalid_request_error")

    plan = limits.plan_for(user.plan)
    limits.check_request(user.id, plan)
    slot = limits.Slot(user.id, plan)
    slot.acquire()
    prompt_text = json.dumps(body["messages"])
    if llm.estimate_tokens(prompt_text) > plan.max_context_tokens:
        slot.release()
        return oai_error(400, f"Prompt too long: the {plan.label} plan allows about "
                              f"{plan.max_context_tokens:,} tokens of context", "invalid_request_error")
    req = llm.prepare_body({**body, "messages": [identity_message(), *body["messages"]]}, plan.max_output_tokens)

    if not req.get("stream"):
        try:
            data = await llm.complete_chat(req)
        except llm.LLMError as e:
            return oai_error(502, f"Model error: {e.text[:200]}")
        except Exception:
            return oai_error(503, "Model server is offline, try again shortly")
        finally:
            slot.release()
        u = data.get("usage") or {}
        pt = u.get("prompt_tokens") or llm.estimate_tokens(prompt_text)
        ct = u.get("completion_tokens") or llm.estimate_tokens(
            "".join((c.get("message") or {}).get("content") or "" for c in data.get("choices", [])))
        record(db, user, "api", pt, ct, key, llm.cached_tokens(u, data))
        data["model"] = get_settings().public_model
        data.pop("provider", None)
        data["usage"] = llm.public_usage({**u, "prompt_tokens": pt, "completion_tokens": ct}, data,
                                         lambda p, c, k: limits.cost_usd(plan, p, c, k))
        return data

    user_id, key_id = user.id, key.id

    def price(prompt_tokens: int, completion_tokens: int, cached: int) -> float:
        return limits.cost_usd(plan, prompt_tokens, completion_tokens, cached)

    async def gen():
        result = llm.StreamResult()
        try:
            async for line in llm.stream_chat(req, result):
                yield llm.rename_model(line, get_settings().public_model, price)
        except Exception as e:
            err = {"error": {"message": "Model server error" if isinstance(e, llm.LLMError)
                             else "Model server is offline", "type": "server_error"}}
            yield f"data: {json.dumps(err)}\n\ndata: [DONE]\n\n".encode()
        finally:
            slot.release()
            result.finalize(prompt_text)
            s = SessionLocal()
            try:
                record_stream(s, s.get(User, user_id), "api", result, s.get(ApiKey, key_id))
            finally:
                s.close()

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
