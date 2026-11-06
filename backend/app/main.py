from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .auth import require_token
from .config import settings
from .db import init_db
from .routers import auth, catalog, sync, tasks


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.frontend_dir and (settings.api_token == "change-me" or len(settings.api_token) < 20):
        raise RuntimeError("Set TODO_API_TOKEN to a long random string (20+ characters) before going public.")
    if settings.frontend_dir and settings.password and len(settings.password) < 8:
        raise RuntimeError("TODO_PASSWORD must be at least 8 characters.")
    init_db()
    yield


app = FastAPI(title="To-do API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

protected = [Depends(require_token)]
app.include_router(tasks.router, dependencies=protected)
app.include_router(catalog.router, dependencies=protected)
app.include_router(sync.router, dependencies=protected)
app.include_router(auth.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


if settings.frontend_dir and settings.frontend_dir.is_dir():
    index = settings.frontend_dir / "index.html"

    @app.get("/", include_in_schema=False)
    def spa_index() -> FileResponse:
        # Never cache the shell, so new deploys show up; the service worker handles offline.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="app")
