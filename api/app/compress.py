"""Context compression for website chats.

When a conversation's live history reaches COMPRESS_AT (80%) of the plan's context budget,
older messages are folded into a running summary written by the model itself. The most
recent messages (about KEEP_RECENT of the budget) are always kept word-for-word.
"""
from . import llm
from .models import Conversation, Message

COMPRESS_AT = 0.80
KEEP_RECENT = 0.30
SUMMARY_MAX_TOKENS = 2000

SUMMARY_PROMPT = (
    "You compress chat history. Write a dense summary of the conversation below so the assistant can "
    "continue it seamlessly. Keep: the user's goals and preferences, decisions made, facts and numbers, "
    "names, file names, and any code that is still relevant (copy important code verbatim in fenced blocks). "
    "Drop greetings and repetition. Write in the same language as the conversation. Output only the summary."
)


def _tokens(m: Message) -> int:
    return llm.estimate_tokens(m.content) + 4


def live_messages(conv: Conversation, msgs: list[Message]) -> list[Message]:
    return [m for m in msgs if m.id > conv.summary_upto]


def context_used(conv: Conversation, msgs: list[Message]) -> int:
    return llm.estimate_tokens(conv.summary) + sum(_tokens(m) for m in live_messages(conv, msgs))


def needs_compression(conv: Conversation, msgs: list[Message], budget: int) -> bool:
    return context_used(conv, msgs) >= COMPRESS_AT * budget and len(live_messages(conv, msgs)) > 2


def split_for_compression(conv: Conversation, msgs: list[Message], budget: int):
    """Returns (old messages to fold into the summary, recent messages to keep)."""
    live = live_messages(conv, msgs)
    keep, used = [], 0
    for m in reversed(live):
        if len(keep) >= 2 and used + _tokens(m) > KEEP_RECENT * budget:
            break
        keep.append(m)
        used += _tokens(m)
    keep.reverse()
    old = live[: len(live) - len(keep)]
    return old, keep


async def summarize(conv: Conversation, old: list[Message], max_input_tokens: int) -> tuple[str, int, int]:
    """Asks the model for a new summary. Returns (summary, prompt_tokens, completion_tokens)."""
    parts = []
    if conv.summary:
        parts.append(f"[Summary of the earlier conversation]\n{conv.summary}")
    for m in old:
        parts.append(f"[{m.role}]\n{m.content}")
    transcript = "\n\n".join(parts)
    # never send more than the model can take: keep the newest part of an oversized transcript
    limit_chars = max_input_tokens * 4
    if len(transcript) > limit_chars:
        transcript = transcript[-limit_chars:]
    body = llm.prepare_body({
        "messages": [{"role": "system", "content": SUMMARY_PROMPT},
                     {"role": "user", "content": transcript}],
        "reasoning_effort": "low", "temperature": 0.2,
    }, SUMMARY_MAX_TOKENS)
    data = await llm.complete_chat(body)
    text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    usage = data.get("usage") or {}
    return (text.strip(),
            usage.get("prompt_tokens") or llm.estimate_tokens(transcript),
            usage.get("completion_tokens") or llm.estimate_tokens(text))
