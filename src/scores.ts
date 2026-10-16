// High scores, one table per mode, in this browser and worldwide (a Val Town val:
// tilmanschieber/jtris-scores). The tables themselves are arcade-kit's.
import { createScores } from 'arcade-kit/scores';
import { load } from 'arcade-kit/storage';
import { MODES, ModeId, Rank } from './modes';

export { load, save } from 'arcade-kit/storage';

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

/** Negative when a ranks above b. */
export function compare(rank: Rank, a: ScoreEntry, b: ScoreEntry) {
  if (rank === 'time') return a.time - b.time;
  if (rank === 'lines') return b.lines - a.lines || b.score - a.score;
  return b.score - a.score;
}

const rankOf = (id: ModeId) => MODES.find((m) => m.id === id)!.rank;

const kit = createScores<ModeId, ScoreEntry>({
  game: 'jtris',
  key: 'jtris.scores2',
  tables: MODES.map((m) => m.id),
  url: 'https://tilmanschieber--1cd3eaa4be2911f19c241607ee4eb77e.web.val.run',
  normalize: (e) => ({
    name: e.name,
    score: e.score,
    lines: Number(e.lines) || 0,
    level: Number(e.level) || 0,
    time: Number(e.time) || 0,
    rules: e.rules === 'M' ? 'M' : 'C',
  }),
  compare: (t, a, b) => compare(rankOf(t), a, b),
});

export const { MAX_SCORES, saveTables, rankFor, fetchGlobal, submitGlobal, flushPending } = kit;

export function loadTables(): Tables {
  const tables = kit.loadTables();
  // Earlier versions kept a single A-Type table.
  if (!tables.a.length) {
    try {
      const old = JSON.parse(load('jtris.scores') ?? '[]');
      if (Array.isArray(old)) tables.a = old.filter(kit.isEntry).map(kit.normalize).slice(0, MAX_SCORES);
    } catch {}
  }
  return tables;
}
