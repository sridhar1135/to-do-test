"""Tags and saved filters."""

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import SavedFilter, Tag
from ..schemas import SavedFilterOut, TagOut
from ..services import saved_out, tag_out

router = APIRouter(tags=["tags"])


@router.get("/tags", response_model=list[TagOut])
def list_tags(session: Session = Depends(get_session)) -> list[TagOut]:
    tags = session.exec(select(Tag).where(Tag.deleted_at.is_(None)).order_by(Tag.name)).all()
    return [tag_out(t) for t in tags]


@router.get("/saved-filters", response_model=list[SavedFilterOut])
def list_saved(session: Session = Depends(get_session)) -> list[SavedFilterOut]:
    rows = session.exec(select(SavedFilter).where(SavedFilter.deleted_at.is_(None))).all()
    return [saved_out(f) for f in rows]
