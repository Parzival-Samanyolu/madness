"""Website chat: conversations stored server-side, streamed as simple SSE events."""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import compress, limits, llm
from ..config import get_settings
from ..db import SessionLocal, get_db, utcnow
from ..models import Conversation, Message, User
from ..security import current_user
from ..usage import record, record_stream

router = APIRouter(prefix="/api/conversations", tags=["chat"])


def system_prompt() -> str:
    s = get_settings()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return (f"You are {s.app_name}, a helpful AI assistant that is excellent at both conversation "
            f"and programming. Use Markdown, and fenced code blocks with a language tag for code. "
            f"Current date: {today}.")


class NewMessage(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)
    reasoning_effort: str = "medium"


class Rename(BaseModel):
    title: str = Field(min_length=1, max_length=200)


def _own(db: Session, user: User, conv_id: int) -> Conversation:
    c = db.get(Conversation, conv_id)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    return c


def conv_out(c: Conversation) -> dict:
    return {"id": c.id, "title": c.title, "updated_at": c.updated_at}


@router.get("")
def list_conversations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Conversation).where(Conversation.user_id == user.id)
                      .order_by(Conversation.updated_at.desc()).limit(200))
    return [conv_out(c) for c in rows]


@router.post("")
def create_conversation(user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = Conversation(user_id=user.id)
    db.add(c)
    db.commit()
    return conv_out(c)


def budget_for(user: User) -> int:
    plan = limits.plan_for(user.plan)
    return plan.max_context_tokens - plan.max_output_tokens


def context_info(c: Conversation, msgs: list[Message], budget: int) -> dict:
    return {"used": compress.context_used(c, msgs), "limit": budget,
            "compress_at": compress.COMPRESS_AT, "summary_upto": c.summary_upto}


@router.get("/{conv_id}")
def get_conversation(conv_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _own(db, user, conv_id)
    msgs = db.scalars(select(Message).where(Message.conversation_id == c.id).order_by(Message.id)).all()
    return {**conv_out(c), "context": context_info(c, msgs, budget_for(user)), "messages": [
        {"id": m.id, "role": m.role, "content": m.content, "reasoning": m.reasoning} for m in msgs]}


@router.patch("/{conv_id}")
def rename(conv_id: int, body: Rename, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _own(db, user, conv_id)
    c.title = body.title.strip()
    db.commit()
    return conv_out(c)


@router.delete("/{conv_id}")
def delete(conv_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _own(db, user, conv_id)
    for m in db.scalars(select(Message).where(Message.conversation_id == c.id)):
        db.delete(m)
    db.delete(c)
    db.commit()
    return {"ok": True}


def build_history(msgs: list[Message], budget: int, summary: str = "") -> list[dict]:
    """Summary (if any) + newest messages until the token budget is used.
    Truncation here is only a safety net; compression normally keeps us under budget."""
    out, used = [], llm.estimate_tokens(summary)
    for m in reversed(msgs):
        cost = llm.estimate_tokens(m.content)
        if out and used + cost > budget:
            break
        out.append({"role": m.role, "content": m.content})
        used += cost
    head = [{"role": "system", "content": system_prompt()}]
    if summary:
        head.append({"role": "system", "content":
                     "Summary of the earlier part of this conversation (older messages were compressed):\n\n" + summary})
    return head + list(reversed(out))


def _event(obj: dict) -> bytes:
    return f"data: {json.dumps(obj)}\n\n".encode()


@router.post("/{conv_id}/messages")
def send_message(conv_id: int, body: NewMessage, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    c = _own(db, user, conv_id)
    plan = limits.plan_for(user.plan)
    limits.check_request(user.id, plan)
    slot = limits.Slot(user.id, plan)
    slot.acquire()

    db.add(Message(conversation_id=c.id, role="user", content=body.content))
    if c.title == "New chat":
        c.title = body.content.strip().splitlines()[0][:60] or "New chat"
    c.updated_at = utcnow()
    db.commit()
    budget = plan.max_context_tokens - plan.max_output_tokens
    effort = body.reasoning_effort if body.reasoning_effort in ("low", "medium", "high") else "medium"
    user_id, conv_title = user.id, c.title

    async def gen():
        result = llm.StreamResult()
        error = None
        messages: list[dict] = []
        yield _event({"t": "title", "v": conv_title})
        try:
            s = SessionLocal()
            try:
                conv = s.get(Conversation, conv_id)
                msgs = s.scalars(select(Message).where(Message.conversation_id == conv_id).order_by(Message.id)).all()
                if compress.needs_compression(conv, msgs, budget):
                    yield _event({"t": "compressing"})
                    old, keep = compress.split_for_compression(conv, msgs, budget)
                    try:
                        summary, pt, ct = await compress.summarize(conv, old, budget)
                        if summary:
                            conv.summary, conv.summary_upto = summary, old[-1].id
                            s.commit()
                            record(s, s.get(User, user_id), "web", pt, ct)
                    except Exception as e:  # fall back to plain truncation
                        print("compression failed:", repr(e))
                    yield _event({"t": "compressed", "summary_upto": conv.summary_upto})
                live = compress.live_messages(conv, msgs)
                messages = build_history(live, budget, conv.summary)
                ctx = context_info(conv, msgs, budget)
            finally:
                s.close()
            req = llm.prepare_body({"messages": messages, "stream": True, "reasoning_effort": effort},
                                   plan.max_output_tokens)
            last_c, last_r = 0, 0
            async for _ in llm.stream_chat(req, result):
                # forward only the new text since the previous chunk
                if len(result.reasoning) > last_r:
                    yield _event({"t": "r", "v": result.reasoning[last_r:]})
                    last_r = len(result.reasoning)
                if len(result.content) > last_c:
                    yield _event({"t": "c", "v": result.content[last_c:]})
                    last_c = len(result.content)
        except llm.LLMError as e:
            error = "The model returned an error. Please try again."
            print("LLM error:", e)
        except Exception as e:  # network down, GPU box offline, ...
            error = "The AI server is offline right now. Please try again in a minute."
            print("LLM connection error:", repr(e))
        finally:
            slot.release()
            s = SessionLocal()
            try:
                u = s.get(User, user_id)
                result.finalize(json.dumps(messages))
                if result.content or result.reasoning:
                    s.add(Message(conversation_id=conv_id, role="assistant",
                                  content=result.content, reasoning=result.reasoning))
                    record_stream(s, u, "web", result)
                s.commit()
            finally:
                s.close()
        if error:
            yield _event({"t": "error", "v": error})
        if messages:
            ctx["used"] += llm.estimate_tokens(result.content) + 4
        yield _event({"t": "done", "context": ctx if messages else None,
                      "usage": {"prompt_tokens": result.prompt_tokens,
                                "completion_tokens": result.completion_tokens}})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
