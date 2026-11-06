import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlmodel import Session

from ..auth import bearer, check_password, hash_token, new_session, require_token
from ..config import settings
from ..db import get_session
from ..models import DeviceSession

router = APIRouter(prefix="/auth", tags=["auth"])


class Login(BaseModel):
    username: str
    password: str


@router.get("/config")
def auth_config() -> dict:
    """Tells the sign-in screen whether username/password sign-in is set up."""
    return {"password_login": bool(settings.username and settings.password)}


@router.post("/login")
async def login(body: Login, request: Request, session: Session = Depends(get_session)) -> dict:
    if not (settings.username and settings.password):
        raise HTTPException(400, "Username and password are not set up on the server yet")
    if not check_password(body.username, body.password):
        await asyncio.sleep(1)  # slow down guessing
        raise HTTPException(401, "Wrong username or password")
    return {"token": new_session(session, request.headers.get("user-agent", ""))}


@router.get("/check", dependencies=[Depends(require_token)])
def auth_check() -> dict:
    return {"ok": True}


@router.post("/logout")
def logout(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer), session: Session = Depends(get_session)
) -> dict:
    if creds:
        row = session.get(DeviceSession, hash_token(creds.credentials))
        if row:
            session.delete(row)
            session.commit()
    return {"ok": True}
