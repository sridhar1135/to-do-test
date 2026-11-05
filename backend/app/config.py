from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TODO_")

    # SQLite for local dev; set TODO_DATABASE_URL=postgresql+psycopg://... in production.
    database_url: str = "sqlite:///./todo.db"
    # Single-user app: every request must send "Authorization: Bearer <api_token>".
    api_token: str = "change-me"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
