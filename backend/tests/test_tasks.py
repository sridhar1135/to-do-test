from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from app.services import norm_tag, parse_quick_add


def test_parse_quick_add():
    thu = date(2026, 11, 5)  # a Thursday
    p = parse_quick_add("Call plumber tomorrow #home !high", thu)
    assert p == {"title": "Call plumber", "tags": ["home"], "importance": "high", "due_date": date(2026, 11, 6)}
    p = parse_quick_add("Send SOW fri #Work/Acme !2", thu)
    assert (p["title"], p["tags"], p["importance"], p["due_date"]) == ("Send SOW", ["work/acme"], "medium", date(2026, 11, 6))
    assert parse_quick_add("Email bob@x.com !low", thu)["importance"] == "low"
    assert parse_quick_add("Plan thursday", thu)["due_date"] == date(2026, 11, 12)  # next week, not today
    assert norm_tag("#Home Office!") == "home-office"


def test_requires_token(client):
    assert client.get("/tasks", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_quick_add_inbox_tags_importance(client):
    r = client.post("/tasks", json={"text": "Buy soil #home #errands !med"})
    assert r.status_code == 201
    t = r.json()
    assert (t["title"], t["tags"], t["importance"], t["done"]) == ("Buy soil", ["errands", "home"], "medium", False)
    client.post("/tasks", json={"text": "Rake leaves #HOME"})
    assert sorted(x["name"] for x in client.get("/tags").json()) == ["errands", "home"]
    assert len(client.get("/tasks").json()) == 2  # Inbox shows every open task


def test_nested_tags_and_any_all(client):
    client.post("/tasks", json={"text": "A #work/acme #money"})
    client.post("/tasks", json={"text": "B #work"})
    client.post("/tasks", json={"text": "C #home"})
    tags = {t["name"]: t["color"] for t in client.get("/tags").json()}
    assert tags["work/acme"] == tags["work"]  # child inherits parent color
    titles = lambda params: sorted(t["title"] for t in client.get("/tasks", params=params).json())
    assert titles([("tag", "work")]) == ["A", "B"]  # parent includes children
    assert titles([("tag", "money"), ("tag", "home")]) == ["A", "C"]  # default Any
    assert titles([("tag", "work"), ("tag", "money"), ("match", "all")]) == ["A"]


def test_update_complete_delete(client):
    t = client.post("/tasks", json={"text": "Plan trip #travel"}).json()
    u = client.patch(f"/tasks/{t['id']}", json={"tags": ["family"], "importance": "low", "done": True}).json()
    assert (u["tags"], u["importance"], u["done"]) == (["family"], "low", True)
    assert u["completed_at"] is not None
    assert [x["title"] for x in client.get("/tasks", params={"view": "done"}).json()] == ["Plan trip"]
    assert client.delete(f"/tasks/{t['id']}").status_code == 204
    assert client.get("/tasks", params={"view": "done"}).json() == []


def test_sync_push_pull_last_write_wins(client):
    cursor = client.get("/sync/pull").json()["cursor"]
    tid, fid = str(uuid4()), str(uuid4())
    now = datetime.now(timezone.utc)
    body = {
        "tags": [{"name": "phone", "color": "t3", "updated_at": now.isoformat()}],
        "tasks": [{"id": tid, "title": "Offline task", "importance": "high", "due_date": "2026-11-06",
                   "updated_at": now.isoformat(), "tags": ["phone"]}],
        "saved_filters": [{"id": fid, "name": "Phone stuff", "tags": ["phone"], "mode": "any", "updated_at": now.isoformat()}],
    }
    assert client.post("/sync/push", json=body).json() == {"accepted": 3, "ignored": 0}

    pulled = client.get("/sync/pull", params={"since": cursor}).json()
    assert [(t["title"], t["importance"], t["due_date"]) for t in pulled["tasks"]] == [("Offline task", "high", "2026-11-06")]
    assert [(t["name"], t["color"]) for t in pulled["tags"]] == [("phone", "t3")]
    assert [f["name"] for f in pulled["saved_filters"]] == ["Phone stuff"]

    stale = {"tasks": [{"id": tid, "title": "Older edit", "updated_at": (now - timedelta(minutes=5)).isoformat()}]}
    assert client.post("/sync/push", json=stale).json() == {"accepted": 0, "ignored": 1}
    assert client.get("/sync/pull", params={"since": pulled["cursor"]}).json()["tasks"] == []


def test_auth_check(client):
    assert client.get("/auth/check").json() == {"ok": True}
    assert client.get("/auth/check", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_database_url_normalized():
    from app.config import Settings

    s = Settings(DATABASE_URL="postgres://u:p@host:5432/db")
    assert s.database_url == "postgresql+psycopg://u:p@host:5432/db"
