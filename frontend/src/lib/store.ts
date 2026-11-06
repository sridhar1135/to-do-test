/**
 * In-memory state for the UI, persisted to IndexedDB and synced to the FastAPI backend.
 * Every change is written locally first and queued in the outbox, so the app works offline.
 */
import { db, type SavedFilter, type Tag, type Task } from './db';

export type { SavedFilter, Tag, Task };

export const S: { tasks: Task[]; tags: Tag[]; saved: SavedFilter[] } = { tasks: [], tags: [], saved: [] };

type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'auth';
let syncState: SyncState = 'idle';
let lastSync = 0;
let onRemote: (() => void) | null = null;
let onStatus: (() => void) | null = null;

// Same origin in production (FastAPI serves the app); VITE_API_URL points at the API in dev.
const API_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'todo-access-key';

/** The access key is entered once per device and kept in this browser, never built into the page. */
export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || import.meta.env.VITE_API_TOKEN || '';
  } catch {
    return import.meta.env.VITE_API_TOKEN || '';
  }
}

const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

type SignInResult = 'ok' | 'wrong' | 'unreachable' | 'not-set-up';

/** Is username/password sign-in set up on the server? */
export async function passwordLoginEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/config`);
    return res.ok && (await res.json()).password_login;
  } catch {
    return true;
  }
}

/** Sign in with username and password; keeps the returned per-device session token. */
export async function signInPassword(username: string, password: string): Promise<SignInResult> {
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.status === 401) return 'wrong';
    if (res.status === 400) return 'not-set-up';
    if (!res.ok) return 'unreachable';
    localStorage.setItem(TOKEN_KEY, (await res.json()).token);
    return 'ok';
  } catch {
    return 'unreachable';
  }
}

/** Sign out this device (other devices stay signed in). Local tasks stay on the device. */
export async function signOut() {
  try {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: headers() });
  } catch {
    /* offline: the token is still forgotten locally */
  }
  localStorage.removeItem(TOKEN_KEY);
}

/** Check an access key against the server and keep it if it works. */
export async function signIn(key: string): Promise<SignInResult> {
  try {
    const res = await fetch(`${API_URL}/auth/check`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) return 'wrong';
    if (!res.ok) return 'unreachable';
    localStorage.setItem(TOKEN_KEY, key);
    return 'ok';
  } catch {
    return 'unreachable';
  }
}

export class AuthError extends Error {}
const nowIso = () => new Date().toISOString();
const IMP = [null, 'low', 'medium', 'high'] as const;

export async function loadLocal() {
  const [tasks, tags, saved] = await Promise.all([db.tasks.toArray(), db.tags.toArray(), db.saved.toArray()]);
  S.tasks = tasks;
  S.tags = tags;
  S.saved = saved;
}

export const liveTasks = () => S.tasks.filter((t) => !t.deleted_at);
export const liveTags = () => S.tags.filter((t) => !t.deleted_at);
export const liveSaved = () => S.saved.filter((s) => !s.deleted_at);

// ---------- local writes ----------

export function saveTask(t: Task) {
  t.updated_at = nowIso();
  if (!S.tasks.includes(t)) S.tasks.unshift(t);
  void queue(`task:${t.id}`, () => db.tasks.put(structuredClone(t)));
}

export function deleteTask(t: Task) {
  t.deleted_at = nowIso();
  saveTask(t);
}

export function saveTag(t: Tag) {
  t.updated_at = nowIso();
  if (!S.tags.includes(t)) S.tags.push(t);
  void queue(`tag:${t.name}`, () => db.tags.put(structuredClone(t)));
}

export function saveSaved(s: SavedFilter) {
  s.updated_at = nowIso();
  if (!S.saved.includes(s)) S.saved.push(s);
  void queue(`saved:${s.id}`, () => db.saved.put(structuredClone(s)));
}

async function queue(key: string, write: () => Promise<unknown>) {
  await db.transaction('rw', [db.tasks, db.tags, db.saved, db.outbox], async () => {
    await write();
    await db.outbox.put({ key });
  });
  scheduleSync();
}

// ---------- sync ----------

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

export function scheduleSync(delay = 400) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export function syncStatus() {
  return { state: syncState, lastSync };
}

function setState(s: SyncState) {
  syncState = s;
  onStatus?.();
}

const toApiTask = (t: Task) => ({
  id: t.id,
  title: t.title,
  notes: t.notes,
  done: t.done,
  completed_at: t.doneAt ? new Date(t.doneAt).toISOString() : null,
  importance: IMP[t.pri],
  due_date: t.due,
  created_at: new Date(t.created).toISOString(),
  updated_at: t.updated_at,
  deleted_at: t.deleted_at,
  tags: t.tags
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromApiTask = (r: any): Task => ({
  id: r.id,
  title: r.title,
  tags: r.tags,
  due: r.due_date,
  pri: Math.max(0, IMP.indexOf(r.importance)) as Task['pri'],
  done: r.done,
  doneAt: r.completed_at ? Date.parse(r.completed_at) : null,
  notes: r.notes,
  created: Date.parse(r.created_at),
  updated_at: r.updated_at,
  deleted_at: r.deleted_at
});

export async function syncNow(): Promise<void> {
  if (running) return;
  if (!navigator.onLine) return setState('offline');
  running = true;
  setState('syncing');
  try {
    // 1. Push everything in the outbox.
    const keys = (await db.outbox.toArray()).map((o) => o.key);
    if (keys.length) {
      const ids = (kind: string) => keys.filter((k) => k.startsWith(kind + ':')).map((k) => k.slice(kind.length + 1));
      const [tasks, tags, saved] = await Promise.all([
        db.tasks.bulkGet(ids('task')),
        db.tags.bulkGet(ids('tag')),
        db.saved.bulkGet(ids('saved'))
      ]);
      const res = await fetch(`${API_URL}/sync/push`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          tags: tags.filter(Boolean),
          tasks: (tasks.filter(Boolean) as Task[]).map(toApiTask),
          saved_filters: saved.filter(Boolean)
        })
      });
      if (res.status === 401) throw new AuthError();
      if (!res.ok) throw new Error(`push ${res.status}`);
      await db.outbox.bulkDelete(keys);
    }

    // 2. Pull what changed on other devices.
    const since = (await db.meta.get('cursor'))?.value ?? 0;
    const res = await fetch(`${API_URL}/sync/pull?since=${since}`, { headers: headers() });
    if (res.status === 401) throw new AuthError();
    if (!res.ok) throw new Error(`pull ${res.status}`);
    const data = await res.json();
    const pending = new Set((await db.outbox.toArray()).map((o) => o.key));
    let changed = false;
    await db.transaction('rw', [db.tasks, db.tags, db.saved, db.meta], async () => {
      for (const r of data.tags) {
        if (pending.has(`tag:${r.name}`)) continue;
        const t: Tag = { name: r.name, color: r.color, updated_at: r.updated_at, deleted_at: r.deleted_at };
        changed = merge(S.tags, t, (x) => x.name === t.name) || changed;
        await db.tags.put(t);
      }
      for (const r of data.tasks) {
        if (pending.has(`task:${r.id}`)) continue;
        const t = fromApiTask(r);
        changed = merge(S.tasks, t, (x) => x.id === t.id) || changed;
        await db.tasks.put(t);
      }
      for (const r of data.saved_filters) {
        if (pending.has(`saved:${r.id}`)) continue;
        const s: SavedFilter = { id: r.id, name: r.name, tags: r.tags, mode: r.mode, updated_at: r.updated_at, deleted_at: r.deleted_at };
        changed = merge(S.saved, s, (x) => x.id === s.id) || changed;
        await db.saved.put(s);
      }
      await db.meta.put({ key: 'cursor', value: data.cursor });
    });
    lastSync = Date.now();
    setState('idle');
    if (changed) onRemote?.();
  } catch (err) {
    if (err instanceof AuthError) return setState('auth');
    console.warn('[sync]', err);
    setState(navigator.onLine ? 'error' : 'offline');
  } finally {
    running = false;
  }
}

/** Replace or add a row; returns true when the local copy actually changed. */
function merge<T extends { updated_at: string }>(list: T[], row: T, same: (x: T) => boolean): boolean {
  const i = list.findIndex(same);
  if (i < 0) {
    list.push(row);
    return true;
  }
  if (list[i].updated_at === row.updated_at) return false;
  Object.assign(list[i], row);
  return true;
}

/** Sync on start, when the app regains focus or network, and every 30 s. */
export function startSync(remoteChanged: () => void, statusChanged: () => void) {
  onRemote = remoteChanged;
  onStatus = statusChanged;
  void syncNow();
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => setState('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => void syncNow(), 30_000);
}
