"""Memory: facts Synapse remembers about a user across chats.

After a website chat reply, if the user's message looks like it says something about
themselves (or asks to remember something), a small background request asks the model
to pull out lasting facts. Saved facts are added to the system prompt of every chat.
"""
import asyncio
import json
import re

from sqlalchemy import select

from . import llm
from .db import SessionLocal
from .models import Memory, User

MAX_MEMORIES = 60          # per user
MAX_PROMPT_CHARS = 4000    # how much memory text goes into the system prompt

# Cheap gate so we don't spend a model request on every message: first-person words or
# an explicit "remember" in the languages our users write in (English, Turkish, Azerbaijani, ...).
_PERSONAL = re.compile(
    r"\b(i|i'm|im|i've|my|me|mine|remember|call me|"
    r"ben|benim|bana|beni|adım|ismim|hatırla|unutma|"
    r"mən|mənim|mənə|məni|adım|yadda saxla|"
    r"ich|mein|meine|mich|je|mon|ma|mes|yo|mi|mis)\b",
    re.IGNORECASE,
)

EXTRACT_PROMPT = """You maintain long-term memory for an AI assistant about ONE user.
Read the user's latest message and decide if it reveals lasting facts worth remembering in future chats:
their name, job, studies, location, family/pets, skills, ongoing projects, goals, tools they use, or preferences
about how the assistant should answer. Ignore one-off questions, temporary moods, and anything already known.
If the user explicitly asks you to remember something, save it.
Never save passwords, API keys, card numbers or other secrets.

Already known:
{known}

Reply with ONLY a JSON array of short facts written in third person, in the user's language
(e.g. ["Name is Murad", "Is building an AI website called Synapse"]). Reply [] if there is nothing new."""

_tasks: set[asyncio.Task] = set()  # keep references so background tasks aren't garbage-collected


def looks_personal(text: str) -> bool:
    return bool(_PERSONAL.search(text or ""))


def list_for(db, user_id: int) -> list[Memory]:
    return db.scalars(select(Memory).where(Memory.user_id == user_id).order_by(Memory.id)).all()


def prompt_block(db, user: User) -> str:
    """Text added to the chat system prompt, or "" if memory is off/empty."""
    if not user.memory_enabled:
        return ""
    lines, size = [], 0
    for m in reversed(list_for(db, user.id)):  # newest first so they survive the size cap
        size += len(m.content) + 3
        if size > MAX_PROMPT_CHARS:
            break
        lines.append(f"- {m.content}")
    if not lines:
        return ""
    return ("What you remember about this user from earlier chats (use it naturally when relevant, "
            "don't list it back unless asked):\n" + "\n".join(reversed(lines)))


def parse_facts(text: str) -> list[str]:
    m = re.search(r"\[.*\]", text or "", re.S)
    if not m:
        return []
    try:
        items = json.loads(m.group(0))
    except ValueError:
        return []
    return [str(x).strip()[:500] for x in items if isinstance(x, str) and str(x).strip()][:5]


async def extract_and_save(user_id: int, user_message: str):
    """Background job: ask the model for new facts and store them. Never raises."""
    try:
        s = SessionLocal()
        try:
            user = s.get(User, user_id)
            if not user or not user.memory_enabled:
                return
            known = [m.content for m in list_for(s, user_id)]
        finally:
            s.close()
        body = llm.prepare_body({
            "messages": [
                {"role": "system", "content": EXTRACT_PROMPT.format(known="\n".join(f"- {k}" for k in known) or "(nothing yet)")},
                {"role": "user", "content": user_message[:4000]},
            ],
            "reasoning_effort": "low", "temperature": 0.1,
        }, 300)
        data = await llm.complete_chat(body)
        text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
        facts = [f for f in parse_facts(text) if f.lower() not in {k.lower() for k in known}]
        if not facts:
            return
        s = SessionLocal()
        try:
            for f in facts:
                s.add(Memory(user_id=user_id, content=f))
            s.commit()
            # keep only the newest MAX_MEMORIES
            mems = list_for(s, user_id)
            for m in mems[: max(0, len(mems) - MAX_MEMORIES)]:
                s.delete(m)
            s.commit()
        finally:
            s.close()
    except Exception as e:  # memory must never break chat
        print("memory extraction failed:", repr(e))


def remember_in_background(user_id: int, user_message: str):
    if not looks_personal(user_message):
        return
    t = asyncio.create_task(extract_and_save(user_id, user_message))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
