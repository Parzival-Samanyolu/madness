"""Settings > Memory: see, add, edit and delete what Synapse remembers; turn memory on/off."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.orm import Session

from .. import memory
from ..db import get_db
from ..models import Memory, User
from ..security import current_user

router = APIRouter(prefix="/api/memories", tags=["memory"])


class NewMemory(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class MemorySettings(BaseModel):
    enabled: bool


def out(m: Memory) -> dict:
    return {"id": m.id, "content": m.content, "created_at": m.created_at}


@router.get("")
def list_memories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"enabled": user.memory_enabled, "memories": [out(m) for m in reversed(memory.list_for(db, user.id))]}


@router.post("")
def add_memory(body: NewMemory, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if len(memory.list_for(db, user.id)) >= memory.MAX_MEMORIES:
        raise HTTPException(400, f"Memory is full ({memory.MAX_MEMORIES} items). Delete some first.")
    m = Memory(user_id=user.id, content=body.content.strip())
    db.add(m)
    db.commit()
    return out(m)


@router.put("/settings")
def set_enabled(body: MemorySettings, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.memory_enabled = body.enabled
    db.commit()
    return {"enabled": user.memory_enabled}


@router.patch("/{memory_id}")
def edit_memory(memory_id: int, body: NewMemory, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = db.get(Memory, memory_id)
    if not m or m.user_id != user.id:
        raise HTTPException(404, "Memory not found")
    m.content = body.content.strip()
    db.commit()
    return out(m)


@router.delete("/{memory_id}")
def delete_memory(memory_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = db.get(Memory, memory_id)
    if not m or m.user_id != user.id:
        raise HTTPException(404, "Memory not found")
    db.delete(m)
    db.commit()
    return {"ok": True}


@router.delete("")
def delete_all(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(Memory).where(Memory.user_id == user.id))
    db.commit()
    return {"ok": True}
