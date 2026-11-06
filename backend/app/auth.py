"""Authentication for a single-user app.

Two ways in, both sent as "Authorization: Bearer <token>":
- a session token from POST /auth/login (username + password, one per device), or
- the raw access key TODO_API_TOKEN (backup, and for scripts).
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from .config import settings
from .db import get_session
from .models import DeviceSession

bearer = HTTPBearer(auto_error=False)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(session: Session, device: str) -> str:
    token = secrets.token_urlsafe(32)
    session.add(DeviceSession(token_hash=hash_token(token), device=device[:200]))
    session.commit()
    return token


def check_password(username: str, password: str) -> bool:
    if not settings.username or not settings.password:
        return False
    ok_user = secrets.compare_digest(username.strip().lower().encode(), settings.username.strip().lower().encode())
    ok_pass = secrets.compare_digest(password.encode(), settings.password.encode())
    return ok_user and ok_pass


def require_token(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(get_session),
) -> None:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    token = creds.credentials
    if secrets.compare_digest(token, settings.api_token):
        return
    row = session.get(DeviceSession, hash_token(token))
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    now = datetime.now(timezone.utc)
    last = row.last_used_at if row.last_used_at.tzinfo else row.last_used_at.replace(tzinfo=timezone.utc)
    if now - last > timedelta(hours=1):  # avoid a write on every request
        row.last_used_at = now
        session.add(row)
        session.commit()
