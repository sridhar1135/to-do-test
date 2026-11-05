from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from .models import Importance


class TaskCreate(BaseModel):
    """Quick add: "Call plumber tomorrow #home !high"."""

    text: str
    id: UUID | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    notes: str | None = None
    done: bool | None = None
    importance: Importance | None = None
    due_date: date | None = None
    tags: list[str] | None = None  # replaces the full tag set when given


class TaskOut(BaseModel):
    id: UUID
    title: str
    notes: str
    done: bool
    completed_at: datetime | None
    importance: Importance | None
    due_date: date | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    tags: list[str]


class TagOut(BaseModel):
    id: UUID
    name: str
    color: str
    updated_at: datetime
    deleted_at: datetime | None


class SavedFilterOut(BaseModel):
    id: UUID
    name: str
    tags: list[str]
    mode: Literal["any", "all"]
    updated_at: datetime
    deleted_at: datetime | None


# ---- sync ----


class SyncTask(BaseModel):
    id: UUID
    title: str
    notes: str = ""
    done: bool = False
    completed_at: datetime | None = None
    importance: Importance | None = None
    due_date: date | None = None
    created_at: datetime | None = None
    updated_at: datetime
    deleted_at: datetime | None = None
    tags: list[str] = []


class SyncTag(BaseModel):
    name: str
    color: str = "t8"
    updated_at: datetime
    deleted_at: datetime | None = None


class SyncSavedFilter(BaseModel):
    id: UUID
    name: str
    tags: list[str]
    mode: Literal["any", "all"] = "any"
    updated_at: datetime
    deleted_at: datetime | None = None


class SyncPush(BaseModel):
    tags: list[SyncTag] = []
    tasks: list[SyncTask] = []
    saved_filters: list[SyncSavedFilter] = []


class SyncPullOut(BaseModel):
    cursor: int
    tasks: list[TaskOut]
    tags: list[TagOut]
    saved_filters: list[SavedFilterOut]
