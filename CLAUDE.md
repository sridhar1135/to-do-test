# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Backend (`backend/`, Python 3.12+):

```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -e '.[dev]'
uvicorn app.main:app --reload            # API on :8000, docs at /docs
pytest                                   # all tests
pytest tests/test_tasks.py::test_parse_quick_add   # one test
```

Front end (`frontend/`, Node 22):

```bash
npm install
npm run dev      # http://localhost:5173 (needs .env from .env.example)
npm run check    # svelte-check type checking
npm run build    # static PWA into build/
```

Production: the root `Dockerfile` builds the PWA and serves it from FastAPI (`TODO_FRONTEND_DIR`), so app and API share one origin. Deployed on Render (`render.yaml`) with a Neon Postgres (`DATABASE_URL`). Sign-in: username/password (`TODO_USERNAME`/`TODO_PASSWORD`) via `/auth/login` returns a per-device session token (only its SHA-256 is stored, table `device_session`); the access key `TODO_API_TOKEN` (20+ chars, enforced when serving the app) still works as a backup. The token is stored in that browser; never bake it into the build (`VITE_API_TOKEN` is for local dev only).

## Code map

- `backend/app/models.py`: tables (task, tag, task_tag, saved_filter, counter). `services.py`: quick-add parser, tag helpers, serializers. `routers/`: tasks, tags/saved filters, sync.
- `frontend/src/lib/ui.js`: the whole UI, ported from the mockup's script (string-rendered HTML, `data-act` click actions). `app.css`: the mockup's styles. `store.ts`: in-memory state, IndexedDB persistence, outbox and push/pull sync. `db.ts`: Dexie schema.
- The quick-add parser exists twice (`services.py` and `ui.js`); keep the rules identical.
- SvelteKit 3: config lives in `vite.config.ts` (no `svelte.config.js`), `#lib/...` imports come from `imports` in `package.json`, and env vars are Vite `VITE_*`.

## What this project is

A personal to-do app in the style of TickTick, used on iPhone, iPad, Mac and in desktop browsers, with all devices syncing through the owner's own backend.

## Confirmed stack

- **Backend:** Python, FastAPI, PostgreSQL. The owner prefers Python, so keep server-side code and tooling in Python.
- **Client:** one installable, offline-capable web app (PWA) built with SvelteKit and TypeScript, storing data in IndexedDB via Dexie. There are no native iOS or macOS apps; the PWA is installed to the home screen or dock on each device.

Because the client must work offline, the PWA keeps a local copy of the data and syncs changes to the FastAPI backend when it is online. The backend is the source of truth across devices.

## v1 scope

- Quick-add tasks, which land in an **Inbox** by default. The quick-add box parses inline tokens: `#tag` attaches a tag and `!high` / `!med` / `!low` sets importance; the tokens are stripped from the task title.
- Flexible tags: a task can have many tags and a tag can be on many tasks (many-to-many).
- Importance: High, Medium or Low, shown to the user in those plain words (not as numbers or colour alone). Stored as a constrained enum (`high` / `medium` / `low`) on the task. Following the approved mockup, a task may also have no importance (null), shown with no label.
- Due dates via `today` / `tomorrow` / weekday words in quick add; nested tags with `/`; Any/All tag filters (default Any); saved filters. No Lists in v1.

## Design reference

The owner approved the UX mockup on 2026-11-05: https://claude.ai/artifact/6iQc3AEqYhw7mYMQcbBjbm (source also in the project's shared files at `ux-mockup/todo-mockup.html`, outside this repo). It shows an iPhone frame and a Mac frame sharing one data store. It is the reference for layout, wording (the field is called "Importance") and interactions.
