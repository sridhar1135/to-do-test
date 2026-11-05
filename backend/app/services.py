"""Quick-add parsing, tag helpers and serializers. Mirrors frontend/src/lib/quickadd.ts."""

import re
from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, select

from .models import Counter, Importance, SavedFilter, Tag, Task
from .schemas import SavedFilterOut, TagOut, TaskOut

COLORS = [f"t{i}" for i in range(1, 9)]
TAG_TOKEN = re.compile(r"^#([\w\-/]+)$", re.UNICODE)
IMPORTANCE_TOKEN = re.compile(r"^!([1-3]|low|med|medium|high)$", re.IGNORECASE)
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WEEKDAYS_FULL = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def norm_tag(raw: str) -> str:
    """'#Work/ACME ' -> 'work/acme' (same rules as the mockup's normTag)."""
    s = raw.lower().strip().lstrip("#")
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^\w\-/]", "", s, flags=re.UNICODE)
    s = re.sub(r"/{2,}", "/", s)
    return s.strip("/")


def date_word(word: str, today: date) -> date | None:
    w = word.lower().rstrip(".,")
    if w in ("today", "tonight"):
        return today
    if w in ("tomorrow", "tmrw", "tmr"):
        return today + timedelta(days=1)
    for names in (WEEKDAYS, WEEKDAYS_FULL):
        if w in names:
            ahead = (names.index(w) - today.weekday()) % 7 or 7
            return today + timedelta(days=ahead)
    return None


def parse_importance(token: str) -> Importance:
    v = token.lower()
    if v in ("1", "low"):
        return Importance.low
    if v in ("2", "med", "medium"):
        return Importance.medium
    return Importance.high


def parse_quick_add(text: str, today: date | None = None) -> dict:
    """'Call plumber tomorrow #home !high' -> title, tags, importance, due_date."""
    today = today or date.today()
    out: dict = {"title": "", "tags": [], "importance": None, "due_date": None}
    rest: list[str] = []
    for word in text.split():
        if m := TAG_TOKEN.match(word):
            name = norm_tag(m.group(1))
            if name and name not in out["tags"]:
                out["tags"].append(name)
        elif m := IMPORTANCE_TOKEN.match(word):
            out["importance"] = parse_importance(m.group(1))
        elif out["due_date"] is None and (d := date_word(word, today)):
            out["due_date"] = d
        else:
            rest.append(word)
    out["title"] = " ".join(rest)
    return out


def as_utc(dt: datetime | None) -> datetime | None:
    """SQLite drops tzinfo; treat naive values as UTC so comparisons work."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def next_seq(session: Session) -> int:
    counter = session.get(Counter, 1)
    if counter is None:
        counter = Counter(id=1, value=0)
        session.add(counter)
        session.flush()  # make it visible to later get() calls
    counter.value += 1
    session.add(counter)
    return counter.value


def tag_by_name(session: Session, name: str) -> Tag | None:
    return session.exec(select(Tag).where(Tag.name == name)).first()


def ensure_tag(session: Session, raw: str, color: str | None = None) -> Tag | None:
    """Create the tag and any missing parents. Children inherit the parent's color."""
    name = norm_tag(raw)
    if not name:
        return None
    path = ""
    tag = None
    for i, part in enumerate(name.split("/")):
        parent = tag
        path = f"{path}/{part}" if i else part
        tag = tag_by_name(session, path)
        if tag is None or tag.deleted_at is not None:
            if tag is None:
                top_level = session.exec(select(Tag).where(~Tag.name.contains("/"))).all()
                tag = Tag(name=path)
                tag.color = parent.color if parent else COLORS[len(top_level) % len(COLORS)]
            tag.deleted_at = None
            tag.updated_at = datetime.now(timezone.utc)
            tag.seq = next_seq(session)
            session.add(tag)
            session.flush()
    if color and tag.color != color:
        tag.color = color
    return tag


def ensure_tags(session: Session, names: list[str]) -> list[Tag]:
    tags: list[Tag] = []
    for n in names:
        t = ensure_tag(session, n)
        if t and t not in tags:
            tags.append(t)
    return tags


def task_out(task: Task) -> TaskOut:
    return TaskOut(
        id=task.id,
        title=task.title,
        notes=task.notes,
        done=task.done,
        completed_at=as_utc(task.completed_at),
        importance=task.importance,
        due_date=task.due_date,
        created_at=as_utc(task.created_at),
        updated_at=as_utc(task.updated_at),
        deleted_at=as_utc(task.deleted_at),
        tags=sorted(t.name for t in task.tags if t.deleted_at is None),
    )


def tag_out(tag: Tag) -> TagOut:
    return TagOut(
        id=tag.id,
        name=tag.name,
        color=tag.color,
        updated_at=as_utc(tag.updated_at),
        deleted_at=as_utc(tag.deleted_at),
    )


def saved_out(f: SavedFilter) -> SavedFilterOut:
    return SavedFilterOut(
        id=f.id,
        name=f.name,
        tags=list(f.tags),
        mode=f.mode,
        updated_at=as_utc(f.updated_at),
        deleted_at=as_utc(f.deleted_at),
    )
