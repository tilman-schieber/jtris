// Tetromino data. Coordinates are [x, y] offsets, y grows downward.
// Order matches the NES statistics panel: T J Z O S L I.
export type Cell = readonly [number, number];
export type Kick = readonly [number, number];

export const T = 0, J = 1, Z = 2, O = 3, S = 4, L = 5, I = 6;

// --- Classic (NES) rotation: offsets around a pivot, no kicks. ---

const rotateAroundPivot = (cells: Cell[]): Cell[] => cells.map(([x, y]) => [-y, x] as Cell);

function pivotStates(spawn: Cell[]): Cell[][] {
  const states = [spawn];
  for (let i = 0; i < 3; i++) states.push(rotateAroundPivot(states[states.length - 1]));
  return states;
}

export const NES_PIECES: Cell[][][] = [
  pivotStates([[-1, 0], [0, 0], [1, 0], [0, 1]]), // T
  pivotStates([[-1, 0], [0, 0], [1, 0], [1, 1]]), // J
  [
    [[-1, 0], [0, 0], [0, 1], [1, 1]],
    [[1, -1], [0, 0], [1, 0], [0, 1]],
  ], // Z
  [[[-1, 0], [0, 0], [-1, 1], [0, 1]]], // O
  [
    [[0, 0], [1, 0], [-1, 1], [0, 1]],
    [[0, -1], [0, 0], [1, 0], [1, 1]],
  ], // S
  pivotStates([[-1, 0], [0, 0], [1, 0], [-1, 1]]), // L
  [
    [[-2, 0], [-1, 0], [0, 0], [1, 0]],
    [[0, -2], [0, -1], [0, 0], [0, 1]],
  ], // I
];

// --- Modern (SRS) rotation: cells inside an n×n box, with wall kicks. ---

function boxStates(spawn: Cell[], n: number): Cell[][] {
  const states = [spawn];
  for (let i = 0; i < 3; i++) states.push(states[states.length - 1].map(([x, y]) => [n - 1 - y, x] as Cell));
  return states;
}

export const SRS_PIECES: Cell[][][] = [
  boxStates([[1, 0], [0, 1], [1, 1], [2, 1]], 3), // T
  boxStates([[0, 0], [0, 1], [1, 1], [2, 1]], 3), // J
  boxStates([[0, 0], [1, 0], [1, 1], [2, 1]], 3), // Z
  [[[1, 0], [2, 0], [1, 1], [2, 1]]], // O
  boxStates([[1, 0], [2, 0], [0, 1], [1, 1]], 3), // S
  boxStates([[2, 0], [0, 1], [1, 1], [2, 1]], 3), // L
  boxStates([[0, 1], [1, 1], [2, 1], [3, 1]], 4), // I
];

// SRS kick tests (x right, y up as in the guideline), keyed "from>to".
const JLSTZ_KICKS: Record<string, Kick[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS: Record<string, Kick[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

export function srsKicks(type: number, from: number, to: number): Kick[] {
  if (type === O) return [[0, 0]];
  return (type === I ? I_KICKS : JLSTZ_KICKS)[`${from}>${to}`];
}

// Spawn positions: classic uses a pivot at column 5; SRS a box at column 3.
export const NES_SPAWN = { x: 5, y: 0 };
export const SRS_SPAWN = (type: number) => ({ x: 3, y: type === I ? -1 : 0 });

// Tile style per piece: 0 = white core with color rim, 1 = primary color, 2 = secondary color.
export const STYLE = [0, 1, 2, 0, 1, 2, 0];

// NES level palettes [primary, secondary], cycling every 10 levels.
export const PALETTES: [string, string][] = [
  ['#0058f8', '#3cbcfc'],
  ['#00a800', '#b8f818'],
  ['#d800cc', '#f878f8'],
  ['#0058f8', '#58d854'],
  ['#e40058', '#58f898'],
  ['#58f898', '#6888fc'],
  ['#f83800', '#7c7c7c'],
  ['#6844fc', '#a80020'],
  ['#0058f8', '#f83800'],
  ['#f83800', '#fca044'],
];

// Modern mode: one fixed color per piece.
export const MODERN_COLORS = ['#b44cff', '#3a6bff', '#ff3b3b', '#ffd83a', '#3fe05a', '#ff9a2e', '#3ee8f0'];
