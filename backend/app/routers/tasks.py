from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlmodel import Session, select

from ..db import get_session
from ..models import Tag, Task, TaskTag, utcnow
from ..schemas import TaskCreate, TaskOut, TaskUpdate
from ..services import ensure_tags, next_seq, norm_tag, parse_quick_add, task_out

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=TaskOut, status_code=201)
def create_task(body: TaskCreate, session: Session = Depends(get_session)) -> TaskOut:
    """Quick add: '#tag', '!low/!med/!high' and 'today/tomorrow/fri' are parsed out of the text."""
    parsed = parse_quick_add(body.text)
    if not parsed["title"]:
        raise HTTPException(422, "Task needs a title")
    task = Task(
        title=parsed["title"],
        importance=parsed["importance"],
        due_date=parsed["due_date"],
        seq=next_seq(session),
    )
    if body.id:
        task.id = body.id
    session.add(task)
    with session.no_autoflush:
        task.tags = ensure_tags(session, parsed["tags"])
    session.commit()
    session.refresh(task)
    return task_out(task)


def _tag_clause(name: str):
    """Match the tag itself and its children ('work' matches 'work/acme')."""
    return select(TaskTag.task_id).join(Tag, Tag.id == TaskTag.tag_id).where(
        Tag.deleted_at.is_(None), or_(Tag.name == name, Tag.name.startswith(name + "/"))
    )


@router.get("", response_model=list[TaskOut])
def list_tasks(
    view: Literal["inbox", "today", "upcoming", "done"] = "inbox",
    tag: list[str] = Query(default=[]),
    match: Literal["any", "all"] = "any",
    session: Session = Depends(get_session),
) -> list[TaskOut]:
    """Inbox = all open tasks. Filter with ?tag=home&tag=errands&match=any|all."""
    stmt = select(Task).where(Task.deleted_at.is_(None))
    today = date.today()
    if view == "done":
        stmt = stmt.where(Task.done.is_(True))
    else:
        stmt = stmt.where(Task.done.is_(False))
    if view == "today":
        stmt = stmt.where(Task.due_date <= today)
    elif view == "upcoming":
        from datetime import timedelta

        stmt = stmt.where(Task.due_date >= today, Task.due_date <= today + timedelta(days=6))
    names = [n for n in (norm_tag(t) for t in tag) if n]
    if names:
        clauses = [Task.id.in_(_tag_clause(n)) for n in names]
        stmt = stmt.where(*clauses) if match == "all" else stmt.where(or_(*clauses))
    return [task_out(t) for t in session.exec(stmt.order_by(Task.created_at.desc())).all()]


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: UUID, body: TaskUpdate, session: Session = Depends(get_session)) -> TaskOut:
    task = session.get(Task, task_id)
    if task is None or task.deleted_at:
        raise HTTPException(404, "Task not found")
    data = body.model_dump(exclude_unset=True)
    tag_names = data.pop("tags", None)
    for key, value in data.items():
        setattr(task, key, value)
    if "done" in data:
        task.completed_at = utcnow() if task.done else None
    if tag_names is not None:
        with session.no_autoflush:
            task.tags = ensure_tags(session, tag_names)
    task.updated_at = utcnow()
    task.seq = next_seq(session)
    session.add(task)
    session.commit()
    session.refresh(task)
    return task_out(task)


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: UUID, session: Session = Depends(get_session)) -> None:
    """Soft delete, so other devices learn about it on their next pull."""
    task = session.get(Task, task_id)
    if task is None:
        raise HTTPException(404, "Task not found")
    task.deleted_at = task.updated_at = utcnow()
    task.seq = next_seq(session)
    session.add(task)
    session.commit()
