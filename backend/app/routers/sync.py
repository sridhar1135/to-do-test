"""Offline sync.

Each device keeps a full local copy, queues edits in an outbox and:
  POST /sync/push   send changed tags, tasks and saved filters (last-write-wins on updated_at)
  GET  /sync/pull   fetch everything changed since the cursor it last saw
"""

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import SavedFilter, Tag, Task
from ..schemas import SyncPullOut, SyncPush
from ..services import as_utc, ensure_tag, ensure_tags, next_seq, norm_tag, saved_out, tag_by_name, tag_out, task_out

router = APIRouter(prefix="/sync", tags=["sync"])


def _newer(existing, incoming) -> bool:
    return existing is None or as_utc(incoming.updated_at) > as_utc(existing.updated_at)


@router.post("/push")
def push(body: SyncPush, session: Session = Depends(get_session)) -> dict:
    accepted = ignored = 0
    with session.no_autoflush:
        for inc in body.tags:
            name = norm_tag(inc.name)
            tag = tag_by_name(session, name)
            if not name or not _newer(tag, inc):
                ignored += 1
                continue
            tag = ensure_tag(session, name, inc.color)
            tag.deleted_at = inc.deleted_at
            tag.updated_at = inc.updated_at
            tag.seq = next_seq(session)
            session.add(tag)
            accepted += 1

        for inc in body.tasks:
            task = session.get(Task, inc.id)
            if not _newer(task, inc):
                ignored += 1
                continue
            if task is None:
                task = Task(id=inc.id, title=inc.title)
                session.add(task)
            for key, value in inc.model_dump(exclude={"id", "tags"}, exclude_none=False).items():
                if key == "created_at" and value is None:
                    continue
                setattr(task, key, value)
            task.tags = ensure_tags(session, inc.tags)
            task.seq = next_seq(session)
            accepted += 1

        for inc in body.saved_filters:
            f = session.get(SavedFilter, inc.id)
            if not _newer(f, inc):
                ignored += 1
                continue
            if f is None:
                f = SavedFilter(id=inc.id, name=inc.name)
            f.name, f.tags, f.mode = inc.name, [norm_tag(t) for t in inc.tags], inc.mode
            f.updated_at, f.deleted_at = inc.updated_at, inc.deleted_at
            f.seq = next_seq(session)
            session.add(f)
            accepted += 1
    session.commit()
    return {"accepted": accepted, "ignored": ignored}


@router.get("/pull", response_model=SyncPullOut)
def pull(since: int = 0, session: Session = Depends(get_session)) -> SyncPullOut:
    tasks = session.exec(select(Task).where(Task.seq > since)).all()
    tags = session.exec(select(Tag).where(Tag.seq > since)).all()
    saved = session.exec(select(SavedFilter).where(SavedFilter.seq > since)).all()
    cursor = max([since] + [r.seq for r in (*tasks, *tags, *saved)])
    return SyncPullOut(
        cursor=cursor,
        tasks=[task_out(t) for t in tasks],
        tags=[tag_out(t) for t in tags],
        saved_filters=[saved_out(f) for f in saved],
    )
