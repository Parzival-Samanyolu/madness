from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import PLANS
from ..db import get_db, utcnow
from ..models import Usage, User
from ..security import current_user

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/plans")
def plans():
    return [p.model_dump() for p in PLANS.values()]


@router.get("/usage")
def usage(days: int = 30, user: User = Depends(current_user), db: Session = Depends(get_db)):
    days = max(1, min(days, 90))
    since = (utcnow() - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    day = func.date(Usage.created_at)
    rows = db.execute(
        select(day, Usage.source, func.sum(Usage.prompt_tokens + Usage.completion_tokens), func.count())
        .where(Usage.user_id == user.id, Usage.created_at >= since)
        .group_by(day, Usage.source)).all()
    by_day: dict[str, dict] = {}
    for i in range(days):
        d = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        by_day[d] = {"date": d, "web_tokens": 0, "api_tokens": 0, "requests": 0}
    for d, source, tokens, count in rows:
        d = str(d)[:10]
        if d in by_day:
            by_day[d][f"{source}_tokens"] = int(tokens or 0)
            by_day[d]["requests"] += int(count)
    return list(by_day.values())


class TrainingSetting(BaseModel):
    enabled: bool


@router.put("/settings/training")
def set_training(body: TrainingSetting, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Settings > Data controls > "Help improve Synapse": may this user's chats be used for training?"""
    user.training_opt_in = body.enabled
    db.commit()
    return {"enabled": user.training_opt_in}
