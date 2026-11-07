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


@router.get("/models")
def models(auth: tuple[User, ApiKey] = Depends(api_key_user)):
    name = get_settings().model_name
    return {"object": "list", "data": [
        {"id": name, "object": "model", "created": 1754352000, "owned_by": get_settings().app_name.lower()}]}


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
    req = llm.prepare_body(body, plan.max_output_tokens)

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
        record(db, user, "api", pt, ct, key)
        data["model"] = get_settings().model_name
        return data

    user_id, key_id = user.id, key.id

    async def gen():
        result = llm.StreamResult()
        try:
            async for line in llm.stream_chat(req, result):
                yield line
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
