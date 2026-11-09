"""Website chat: conversations stored server-side, streamed as simple SSE events."""
import asyncio
import json
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete as sql_delete, or_, select
from sqlalchemy.orm import Session

from .. import compress, limits, llm, memory
from ..config import get_settings
from ..db import SessionLocal, get_db, utcnow
from ..models import Conversation, Message, SharedChat, User
from ..security import current_user
from ..usage import record, record_stream

router = APIRouter(prefix="/api/conversations", tags=["chat"])
public = APIRouter(prefix="/api/shared", tags=["chat"])  # shared chat links, no login needed

TITLE_PROMPT = ("Write a short title (2 to 6 words) for this chat, in the same language as the user's message. "
                "Reply with ONLY the title: no quotes, no emoji, no full stop at the end.")


def system_prompt() -> str:
    s = get_settings()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return (f"You are {s.app_name} ({s.public_model}), an AI assistant made by {s.company_name}. "
            f"If asked who you are, who made you or what model you are, say you are {s.app_name}, "
            f"made by {s.company_name}. "
            "Be friendly, warm and clear: explain things simply, get to the point, and use examples when they help. "
            "You are excellent at both conversation and programming. "
            "Always reply in the same language the user writes in. "
            "Use Markdown, and fenced code blocks with a language tag for code. "
            f"Current date: {today}.")


class NewMessage(BaseModel):
    # empty content is only allowed with regenerate=True
    content: str = Field(default="", max_length=100_000)
    reasoning_effort: str = "medium"
    # edit: replace this user message (and everything after it) with `content`
    edit_message_id: int | None = None
    # regenerate: drop the last answer and ask the model again
    regenerate: bool = False


class ConvPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    pinned: bool | None = None


def _own(db: Session, user: User, conv_id: int) -> Conversation:
    c = db.get(Conversation, conv_id)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    return c


def conv_out(c: Conversation) -> dict:
    return {"id": c.id, "title": c.title, "updated_at": c.updated_at, "pinned": c.pinned}


@router.get("")
def list_conversations(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Conversation).where(Conversation.user_id == user.id)
                      .order_by(Conversation.updated_at.desc()).limit(200))
    return [conv_out(c) for c in rows]


def _snippet(text: str, q: str, width: int = 90) -> str:
    i = text.lower().find(q.lower())
    if i < 0:
        return ""
    start = max(0, i - width // 3)
    out = " ".join(text[start:start + width].split())
    return ("…" if start > 0 else "") + out + ("…" if start + width < len(text) else "")


@router.get("/search")
def search(q: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Find chats whose title or messages contain `q` (case-insensitive)."""
    q = q.strip()[:200]
    if len(q) < 2:
        return []
    like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    convs = {c.id: c for c in db.scalars(select(Conversation).where(Conversation.user_id == user.id))}
    hits: dict[int, str] = {cid: "" for cid, c in convs.items() if q.lower() in c.title.lower()}
    rows = db.execute(
        select(Message.conversation_id, Message.content).join(Conversation)
        .where(Conversation.user_id == user.id, Message.content.ilike(like, escape="\\"))
        .order_by(Message.id.desc()).limit(500))
    for cid, content in rows:
        if not hits.get(cid):
            hits[cid] = _snippet(content, q)
    found = sorted((convs[cid] for cid in hits), key=lambda c: c.updated_at, reverse=True)[:50]
    return [{**conv_out(c), "snippet": hits[c.id]} for c in found]


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
    share = db.scalar(select(SharedChat).where(SharedChat.conversation_id == c.id))
    return {**conv_out(c), "context": context_info(c, msgs, budget_for(user)),
            "share": {"token": share.token, "created_at": share.created_at} if share else None, "messages": [
        {"id": m.id, "role": m.role, "content": m.content, "reasoning": m.reasoning} for m in msgs]}


@router.patch("/{conv_id}")
def update(conv_id: int, body: ConvPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Rename and/or pin a chat."""
    c = _own(db, user, conv_id)
    if body.title is not None and body.title.strip():
        c.title = body.title.strip()
    if body.pinned is not None:
        c.pinned = body.pinned
    db.commit()
    return conv_out(c)


@router.delete("/{conv_id}")
def delete(conv_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _own(db, user, conv_id)
    db.execute(sql_delete(SharedChat).where(SharedChat.conversation_id == c.id))
    for m in db.scalars(select(Message).where(Message.conversation_id == c.id)):
        db.delete(m)
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/{conv_id}/share")
def share(conv_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Make (or refresh) a public read-only snapshot. Messages sent later are not included."""
    c = _own(db, user, conv_id)
    msgs = db.scalars(select(Message).where(Message.conversation_id == c.id).order_by(Message.id)).all()
    snap = [{"role": m.role, "content": m.content} for m in msgs if m.content]
    if not snap:
        raise HTTPException(400, "This chat is empty")
    sc = db.scalar(select(SharedChat).where(SharedChat.conversation_id == c.id))
    if not sc:
        sc = SharedChat(token=secrets.token_urlsafe(16), conversation_id=c.id)
        db.add(sc)
    sc.title, sc.messages_json, sc.created_at = c.title, json.dumps(snap), utcnow()
    db.commit()
    return {"token": sc.token, "created_at": sc.created_at}


@router.delete("/{conv_id}/share")
def unshare(conv_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    c = _own(db, user, conv_id)
    db.execute(sql_delete(SharedChat).where(SharedChat.conversation_id == c.id))
    db.commit()
    return {"ok": True}


@public.get("/{token}")
def view_shared(token: str, db: Session = Depends(get_db)):
    sc = db.get(SharedChat, token)
    if not sc:
        raise HTTPException(404, "This link doesn't exist or was turned off")
    return {"title": sc.title, "created_at": sc.created_at, "messages": json.loads(sc.messages_json)}


def _clean_title(text: str) -> str:
    line = next((l for l in (text or "").strip().splitlines() if l.strip()), "")
    line = line.replace("**", "").replace("`", "").strip().strip("\"'*#_").strip()
    if line.lower().startswith("title:"):
        line = line[6:].strip()
    return line.rstrip(".").strip()[:60]


async def make_title(user_text: str, reply: str) -> str:
    """Ask the model for a short chat title. Returns "" on any problem."""
    try:
        body = llm.prepare_body({"messages": [
            {"role": "system", "content": TITLE_PROMPT},
            {"role": "user", "content": f"User: {user_text[:1500]}\n\nAssistant: {reply[:1500]}"},
        ], "reasoning_effort": "low", "temperature": 0.3}, 400)
        data = await llm.complete_chat(body)
        return _clean_title(((data.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
    except Exception as e:
        print("title generation failed:", repr(e))
        return ""


def build_history(msgs: list[Message], budget: int, summary: str = "", memories: str = "") -> list[dict]:
    """Summary (if any) + newest messages until the token budget is used.
    Truncation here is only a safety net; compression normally keeps us under budget."""
    out, used = [], llm.estimate_tokens(summary) + llm.estimate_tokens(memories)
    for m in reversed(msgs):
        cost = llm.estimate_tokens(m.content)
        if out and used + cost > budget:
            break
        out.append({"role": m.role, "content": m.content})
        used += cost
    head = [{"role": "system", "content": system_prompt() + (f"\n\n{memories}" if memories else "")}]
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
    if not body.regenerate and not body.content.strip():
        raise HTTPException(422, "Message is empty")
    msgs = db.scalars(select(Message).where(Message.conversation_id == c.id).order_by(Message.id)).all()
    cut_from = None  # delete messages with id >= cut_from
    if body.edit_message_id is not None:
        target = next((m for m in msgs if m.id == body.edit_message_id and m.role == "user"), None)
        if not target:
            raise HTTPException(404, "Message not found")
        cut_from = target.id
    elif body.regenerate:
        last_user = next((m for m in reversed(msgs) if m.role == "user"), None)
        if not last_user:
            raise HTTPException(400, "Nothing to regenerate")
        cut_from = last_user.id + 1

    plan = limits.plan_for(user.plan)
    limits.check_request(user.id, plan)
    slot = limits.Slot(user.id, plan)
    slot.acquire()

    if cut_from is not None:
        for m in msgs:
            if m.id >= cut_from:
                db.delete(m)
        if c.summary_upto >= cut_from:  # the summary covered deleted messages: start over
            c.summary, c.summary_upto = "", 0
    if not body.regenerate:
        db.add(Message(conversation_id=c.id, role="user", content=body.content))
    auto_title = not body.regenerate and c.title == "New chat"
    if auto_title:  # quick placeholder; the AI writes a better title after the first reply
        c.title = body.content.strip().splitlines()[0][:60] or "New chat"
    c.updated_at = utcnow()
    db.commit()
    budget = plan.max_context_tokens - plan.max_output_tokens
    effort = body.reasoning_effort if body.reasoning_effort in ("low", "medium", "high") else "medium"
    user_id, conv_title = user.id, c.title
    remember_text = "" if body.regenerate else body.content

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
                messages = build_history(live, budget, conv.summary, memory.prompt_block(s, s.get(User, user_id)))
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
            error = ("Synapse is very busy right now. Please try again in a minute." if e.status == 429
                     else "The model returned an error. Please try again.")
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
        if error or not result.content:
            return
        # after "done" the reply is complete; the stream stays open a little longer for the title and memory
        jobs = {}
        if auto_title and body.content.strip():
            jobs["title"] = asyncio.create_task(asyncio.wait_for(make_title(body.content, result.content), 20))
        if remember_text:
            jobs["memory"] = asyncio.create_task(memory.remember(user_id, remember_text))
        for kind, task in jobs.items():
            try:
                value = await task
            except Exception:
                continue
            if kind == "title" and value:
                s = SessionLocal()
                try:
                    conv = s.get(Conversation, conv_id)
                    if conv and conv.title == conv_title:  # the user didn't rename it meanwhile
                        conv.title = value
                        s.commit()
                        yield _event({"t": "title", "v": value})
                finally:
                    s.close()
            elif kind == "memory" and value:
                yield _event({"t": "memory", "v": value})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
