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

const isEntry = (e: unknown): e is ScoreEntry =>
  !!e && typeof (e as ScoreEntry).name === 'string' && Number.isFinite((e as ScoreEntry).score);

const normalize = (e: ScoreEntry): ScoreEntry => ({
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
