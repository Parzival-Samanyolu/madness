from sqlalchemy.orm import Session

from . import limits
from .llm import StreamResult
from .models import ApiKey, Usage, User


def record(db: Session, user: User, source: str, prompt_tokens: int, completion_tokens: int,
           key: ApiKey | None = None):
    db.add(Usage(user_id=user.id, api_key_id=key.id if key else None, source=source,
                 prompt_tokens=prompt_tokens, completion_tokens=completion_tokens))
    db.commit()
    limits.add_tokens(user.id, prompt_tokens + completion_tokens)


def record_stream(db: Session, user: User, source: str, result: StreamResult, key: ApiKey | None = None):
    record(db, user, source, result.prompt_tokens, result.completion_tokens, key)
