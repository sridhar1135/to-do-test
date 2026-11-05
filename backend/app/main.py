from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import require_token
from .config import settings
from .db import init_db
from .routers import catalog, sync, tasks


@asynccontextmanager
async def lifespan(_: FastAPI):
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


@app.get("/health")
def health() -> dict:
    return {"ok": True}
