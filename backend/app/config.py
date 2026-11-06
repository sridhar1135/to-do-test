from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TODO_")

    # SQLite for local dev. In production set TODO_DATABASE_URL (or DATABASE_URL, as
    # Render/Neon/Railway provide it) to a Postgres URL.
    database_url: str = Field(
        default="sqlite:///./todo.db", validation_alias=AliasChoices("TODO_DATABASE_URL", "DATABASE_URL")
    )
    # Single-user app: the "access key". Every API request sends "Authorization: Bearer <api_token>".
    # The PWA asks for it once on each device; it is never built into the page.
    api_token: str = "change-me"
    # Sign-in with a username and password (single user). Set both in the host's environment.
    username: str | None = None
    password: str | None = None
    cors_origins: list[str] = ["http://localhost:5173"]
    # When set (the Docker image sets it), the built PWA is served from this folder at "/",
    # so the app and API share one URL.
    frontend_dir: Path | None = None

    @field_validator("database_url")
    @classmethod
    def use_psycopg3(cls, v: str) -> str:
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix) :]
        return v


settings = Settings()
