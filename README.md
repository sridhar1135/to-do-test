# To-do

A personal TickTick-style to-do app for iPhone, iPad, Mac and any browser, syncing to your own backend.

- **Backend:** Python 3.12, FastAPI, SQLModel. SQLite for local dev, PostgreSQL in production.
- **Front end:** SvelteKit Progressive Web App (PWA). Install it to the iPhone/iPad Home Screen (Safari → Share → Add to Home Screen) or the Mac Dock (Safari → File → Add to Dock).
- **Offline first:** tasks are stored on the device in IndexedDB (Dexie) and synced to the API in the background.

## What works today

The UI is a port of the approved UX mockup (iPhone layout under 900px wide, Mac/desktop layout above).

- **Quick add** to the Inbox: `Call plumber tomorrow #home !high` creates the task with a tag, a due date and High importance. Typing `#` suggests existing tags or creates a new one.
- **Importance**: Low, Medium or High (or none), shown on each task as a coloured label. `!low` `!med` `!high` or `!1` to `!3` in quick add.
- **Due dates**: `today`, `tomorrow` or a weekday (`fri`) in quick add, or None / Today / Tomorrow / Next week in the task details.
- **Flexible tags**: many-to-many, created on the fly, nested with a slash (`#work/acme`). Filtering by `#work` includes `#work/acme`.
- **Views**: Inbox (every open task, untagged ones on top under "Needs a tag"), Today, Next 7 days, Completed, Tags.
- **Tag filters**: combine tags with Any (default) or All; ⌘/Shift-click on the Mac, chips on the iPhone. Save a filter for later. While one tag is filtered, new tasks get that tag.
- **Offline first**: everything is stored on the device (IndexedDB) and synced in the background, last write wins.

## Run it locally

Backend:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env          # set TODO_API_TOKEN
uvicorn app.main:app --reload # API on http://localhost:8000, docs at /docs
pytest                        # run the tests
```

Front end:

```bash
cd frontend
npm install
cp .env.example .env          # dev only: VITE_API_TOKEN must match TODO_API_TOKEN
npm run dev                   # http://localhost:5173
```

## Deploy (Render + Neon, free)

One Docker image serves both the app and the API from the same URL. The access key lives only on the server and is typed once on each device, so it is never inside the public page.

1. **Database:** sign up at [neon.tech](https://neon.tech), create a project, and copy its connection string (`postgresql://...`).
2. **App:** sign up at [render.com](https://render.com) with GitHub, then **New → Blueprint** and pick this repo. Render reads `render.yaml`. Paste the Neon string as `DATABASE_URL` when asked.
3. In the service's **Environment** tab, set `TODO_USERNAME` and `TODO_PASSWORD` (8+ characters) and save. `TODO_API_TOKEN` is a backup access key.
4. Open the `https://<name>.onrender.com` URL and sign in. On iPhone/iPad: Safari → Share → **Add to Home Screen**. On Mac: Safari → File → **Add to Dock** (or install from Chrome).

The free Render plan sleeps after 15 minutes idle, so the first sync after a break takes up to a minute. The app still opens instantly and saves changes on the device in the meantime. Every push to `main` redeploys.

Self-hosting instead: `TODO_API_TOKEN=$(openssl rand -hex 24) docker compose up -d --build`, then put HTTPS in front of port 8000 (needed for installing the PWA).

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/tasks` | Quick add, `{"text": "Call plumber tomorrow #home !high"}` |
| GET | `/tasks?view=inbox&tag=home&tag=errands&match=any` | `view` = inbox, today, upcoming, done; tags match Any or All |
| PATCH | `/tasks/{id}` | Edit title, notes, done, importance, due_date; `tags` replaces the tag set |
| DELETE | `/tasks/{id}` | Soft delete (tombstone for sync) |
| GET | `/tags`, `/saved-filters` | Current tags and saved filters |
| POST | `/sync/push` | Device sends changed tags, tasks and saved filters |
| GET | `/sync/pull?since=<cursor>` | Device fetches everything changed since its cursor |

All endpoints except `/health` need `Authorization: Bearer <TODO_API_TOKEN>`. Interactive docs at `/docs`.

## Data model

- `task`: title, notes, done, completed_at, `importance` (low / medium / high or null), `due_date`, timestamps, `deleted_at`.
- `tag`: `name` (unique, lowercase, `parent/child` for nesting), `color` (palette slot t1 to t8).
- `task_tag`: the many-to-many link between tasks and tags.
- `saved_filter`: name, tag list, any/all.

There are no Lists in v1, only tags (as in the mockup).

## Next up

- Alembic migrations (tables are created on startup for now)
- Reminders (web push) and custom due dates
- Proper login (passkey) instead of a shared token
