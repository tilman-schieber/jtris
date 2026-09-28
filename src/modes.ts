export type ModeId = 'a' | 'b' | 'sprint' | 'ultra' | 'master' | 'hate' | 'versus';
export type Rank = 'score' | 'time' | 'lines' | 'none';

export interface Mode {
  id: ModeId;
  name: string;
  usesLevel: boolean;
  usesHeight: boolean;
  forceModern: boolean;
  rank: Rank;
  /** Lines to finish the mode (success), if any. */
  goal?: number;
  /** Frame limit (ULTRA). */
  timeLimit?: number;
  /** Show a READY / GO countdown before play. */
  countdown: boolean;
}

export const MODES: Mode[] = [
  { id: 'a', name: 'A-TYPE', usesLevel: true, usesHeight: false, forceModern: false, rank: 'score', countdown: false },
  { id: 'b', name: 'B-TYPE', usesLevel: true, usesHeight: true, forceModern: false, rank: 'score', goal: 25, countdown: false },
  { id: 'sprint', name: 'SPRINT', usesLevel: true, usesHeight: false, forceModern: false, rank: 'time', goal: 40, countdown: true },
  { id: 'ultra', name: 'ULTRA', usesLevel: true, usesHeight: false, forceModern: false, rank: 'score', timeLimit: 120 * 60, countdown: true },
  { id: 'master', name: '20G', usesLevel: false, usesHeight: false, forceModern: true, rank: 'score', goal: 100, countdown: true },
  { id: 'hate', name: 'HATE', usesLevel: true, usesHeight: false, forceModern: false, rank: 'lines', countdown: false },
  { id: 'versus', name: 'VERSUS', usesLevel: true, usesHeight: false, forceModern: false, rank: 'none', countdown: true },
];

// NES B-Type garbage heights.
export const B_HEIGHTS = [0, 3, 5, 8, 10, 12];
export const LEVELS = Array.from({ length: 30 }, (_, i) => i);
/** Length of the invisible "roll" after clearing 20G mode's goal. */
export const ROLL_FRAMES = 60 * 60;
