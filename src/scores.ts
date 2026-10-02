import { MODES, ModeId, Rank } from './modes';

export interface ScoreEntry {
  name: string;
  score: number;
  lines: number;
  level: number;
  /** Frames played (SPRINT ranks by this). */
  time: number;
  /** 'C' classic or 'M' modern rules. */
  rules: 'C' | 'M';
}

export type Tables = Record<ModeId, ScoreEntry[]>;

export const MAX_SCORES = 10;
const KEY = 'jtris.scores2';

export function load(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export const isEntry = (e: unknown): e is ScoreEntry =>
  !!e && typeof (e as ScoreEntry).name === 'string' && Number.isFinite((e as ScoreEntry).score);

export const normalize = (e: ScoreEntry): ScoreEntry => ({
  name: e.name.slice(0, 6),
  score: e.score,
  lines: Number(e.lines) || 0,
  level: Number(e.level) || 0,
  time: Number(e.time) || 0,
  rules: e.rules === 'M' ? 'M' : 'C',
});

/** Negative when a ranks above b. */
export function compare(rank: Rank, a: ScoreEntry, b: ScoreEntry) {
  if (rank === 'time') return a.time - b.time;
  if (rank === 'lines') return b.lines - a.lines || b.score - a.score;
  return b.score - a.score;
}

export function loadTables(): Tables {
  const tables = Object.fromEntries(MODES.map((m) => [m.id, [] as ScoreEntry[]])) as unknown as Tables;
  try {
    const raw = JSON.parse(load(KEY) ?? '{}');
    for (const m of MODES) {
      const list = Array.isArray(raw[m.id]) ? raw[m.id].filter(isEntry).map(normalize) : [];
      tables[m.id] = list.sort((a: ScoreEntry, b: ScoreEntry) => compare(m.rank, a, b)).slice(0, MAX_SCORES);
    }
    // Earlier versions kept a single A-Type table.
    if (!tables.a.length) {
      const old = JSON.parse(load('jtris.scores') ?? '[]');
      if (Array.isArray(old)) tables.a = old.filter(isEntry).map(normalize).slice(0, MAX_SCORES);
    }
  } catch {}
  return tables;
}

export const saveTables = (t: Tables) => save(KEY, JSON.stringify(t));

/** Index the entry would take in the table, or -1 if it doesn't make it. */
export function rankFor(list: ScoreEntry[], rank: Rank, e: ScoreEntry) {
  const i = list.findIndex((x) => compare(rank, e, x) < 0);
  const at = i >= 0 ? i : list.length;
  return at < MAX_SCORES ? at : -1;
}

// ---------- world scores (a Val Town val: tilmanschieber/jtris-scores) ----------

const GLOBAL_URL = 'https://tilmanschieber--1cd3eaa4be2911f19c241607ee4eb77e.web.val.run';
/** A hanging server counts as offline after this long. */
const TIMEOUT = 5000;
const PENDING_KEY = 'jtris.pending';
const MAX_PENDING = 20;

const cleanList = (list: unknown) =>
  Array.isArray(list) ? list.filter(isEntry).map(normalize).slice(0, MAX_SCORES) : [];

/** A game waiting to reach the world table; the uid lets the server ignore resends. */
interface Pending {
  mode: ModeId;
  entry: ScoreEntry;
  uid: string;
}

function loadPending(): Pending[] {
  try {
    const raw = JSON.parse(load(PENDING_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.uid === 'string' && isEntry(p.entry)) : [];
  } catch {
    return [];
  }
}

const savePending = (list: Pending[]) => save(PENDING_KEY, JSON.stringify(list.slice(-MAX_PENDING)));

const newUid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** The world top 10 of every mode, or null when offline. */
export async function fetchGlobal(): Promise<Tables | null> {
  try {
    const res = await fetch(GLOBAL_URL, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    const raw = await res.json();
    return Object.fromEntries(MODES.map((m) => [m.id, cleanList(raw[m.id])])) as unknown as Tables;
  } catch {
    return null;
  }
}

type Sent = { rank: number; top: ScoreEntry[] };

/** One attempt; 'retry' when the server can't take it now, 'drop' when it never will. */
async function post(p: Pending): Promise<Sent | 'retry' | 'drop'> {
  try {
    const res = await fetch(GLOBAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: p.mode, ...p.entry, uid: p.uid }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.status === 400) return 'drop';
    if (!res.ok) return 'retry';
    const raw = await res.json();
    return { rank: Number.isInteger(raw.rank) ? raw.rank : -1, top: cleanList(raw.top) };
  } catch {
    return 'retry';
  }
}

/** Sends a finished game; returns its world rank (-1 outside the top 10) and the new top 10, or null if it was queued. */
export async function submitGlobal(mode: ModeId, entry: ScoreEntry): Promise<Sent | null> {
  const p: Pending = { mode, entry: { ...entry }, uid: newUid() };
  const res = await post(p);
  if (res === 'retry') savePending([...loadPending(), p]);
  return typeof res === 'object' ? res : null;
}

let flushing = false;

/** Resends games that didn't get through earlier. */
export async function flushPending() {
  if (flushing) return;
  flushing = true;
  try {
    for (const p of loadPending()) {
      const res = await post(p);
      if (res === 'retry') break;
      savePending(loadPending().filter((q) => q.uid !== p.uid));
    }
  } finally {
    flushing = false;
  }
}
