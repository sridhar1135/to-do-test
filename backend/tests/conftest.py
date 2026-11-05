import os

os.environ["TODO_DATABASE_URL"] = "sqlite://"
os.environ["TODO_API_TOKEN"] = "test-token"

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.db import get_session
from app.main import app


@pytest.fixture
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)

    def override():
        with Session(engine) as s:
            yield s

    app.dependency_overrides[get_session] = override
    with TestClient(app, headers={"Authorization": "Bearer test-token"}) as c:
        yield c
    app.dependency_overrides.clear()
