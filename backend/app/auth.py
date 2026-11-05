import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

bearer = HTTPBearer(auto_error=False)


def require_token(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> None:
    if creds is None or not secrets.compare_digest(creds.credentials, settings.api_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing token")
