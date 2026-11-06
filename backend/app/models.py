"""Database tables (matches the approved UX mockup).

- Inbox = every open task. There are no Lists in v1, only tags.
- Tags are many-to-many through TaskTag. Names are lowercase and nest with a slash
  ("work/acme"); filtering by "work" includes "work/acme".
- Importance is low / medium / high, or empty (shown as no label).
- Every syncable row has updated_at (last-write-wins), deleted_at (tombstone) and
  seq (server change counter used by GET /sync/pull?since=...).
"""

from datetime import date, datetime, timezone
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Importance(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class SyncFields(SQLModel):
    updated_at: datetime = Field(default_factory=utcnow)
    deleted_at: datetime | None = None
    seq: int = Field(default=0, index=True)


class TaskTag(SQLModel, table=True):
    __tablename__ = "task_tag"

    task_id: UUID = Field(foreign_key="task.id", primary_key=True)
    tag_id: UUID = Field(foreign_key="tag.id", primary_key=True)
    created_at: datetime = Field(default_factory=utcnow)


class Tag(SyncFields, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(index=True, unique=True)  # normalized: lowercase, "parent/child"
    color: str = "t8"  # palette slot t1..t8 from the mockup

    tasks: list["Task"] = Relationship(back_populates="tags", link_model=TaskTag)


class Task(SyncFields, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    title: str
    notes: str = ""
    done: bool = False
    completed_at: datetime | None = None
    importance: Importance | None = None
    due_date: date | None = None
    created_at: datetime = Field(default_factory=utcnow)

    tags: list[Tag] = Relationship(back_populates="tasks", link_model=TaskTag)


class SavedFilter(SyncFields, table=True):
    __tablename__ = "saved_filter"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    mode: str = "any"  # any | all


class Counter(SQLModel, table=True):
    """Single-row table holding the global change sequence."""

    id: int = Field(default=1, primary_key=True)
    value: int = 0


class DeviceSession(SQLModel, table=True):
    """A signed-in device. Only a SHA-256 of the session token is stored."""

    __tablename__ = "device_session"

    token_hash: str = Field(primary_key=True)
    device: str = ""
    created_at: datetime = Field(default_factory=utcnow)
    last_used_at: datetime = Field(default_factory=utcnow)
