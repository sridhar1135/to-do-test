import Dexie, { type Table } from 'dexie';

/** Task as the UI uses it (same shape as the approved mockup). */
export interface Task {
  id: string;
  title: string;
  tags: string[]; // normalized names, e.g. "work/acme"
  due: string | null; // YYYY-MM-DD
  pri: 0 | 1 | 2 | 3; // 0 none, 1 Low, 2 Medium, 3 High ("Importance")
  done: boolean;
  doneAt: number | null;
  notes: string;
  created: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface Tag {
  name: string;
  color: string; // t1..t8
  updated_at: string;
  deleted_at: string | null;
}

export interface SavedFilter {
  id: string;
  name: string;
  tags: string[];
  mode: 'any' | 'all';
  updated_at: string;
  deleted_at: string | null;
}

class TodoDB extends Dexie {
  tasks!: Table<Task, string>;
  tags!: Table<Tag, string>;
  saved!: Table<SavedFilter, string>;
  outbox!: Table<{ key: string }, string>; // "task:<id>" | "tag:<name>" | "saved:<id>" not yet pushed
  meta!: Table<{ key: string; value: number }, string>;

  constructor() {
    super('todo');
    this.version(2).stores({
      tasks: 'id',
      tags: 'name',
      saved: 'id',
      outbox: 'key',
      meta: 'key'
    });
  }
}

export const db = new TodoDB();
