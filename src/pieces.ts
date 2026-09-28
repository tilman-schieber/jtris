// NES-style tetrominoes. Coordinates are [x, y] offsets from the pivot, y grows downward.
// Order matches the NES statistics panel: T J Z O S L I.
export type Cell = readonly [number, number];

const rotateCW = (cells: Cell[]): Cell[] => cells.map(([x, y]) => [-y, x] as Cell);

function fourStates(spawn: Cell[]): Cell[][] {
  const states = [spawn];
  for (let i = 0; i < 3; i++) states.push(rotateCW(states[states.length - 1]));
  return states;
}

export const PIECES: Cell[][][] = [
  fourStates([[-1, 0], [0, 0], [1, 0], [0, 1]]), // T
  fourStates([[-1, 0], [0, 0], [1, 0], [1, 1]]), // J
  [
    [[-1, 0], [0, 0], [0, 1], [1, 1]],
    [[1, -1], [0, 0], [1, 0], [0, 1]],
  ], // Z
  [[[-1, 0], [0, 0], [-1, 1], [0, 1]]], // O
  [
    [[0, 0], [1, 0], [-1, 1], [0, 1]],
    [[0, -1], [0, 0], [1, 0], [1, 1]],
  ], // S
  fourStates([[-1, 0], [0, 0], [1, 0], [-1, 1]]), // L
  [
    [[-2, 0], [-1, 0], [0, 0], [1, 0]],
    [[0, -2], [0, -1], [0, 0], [0, 1]],
  ], // I
];

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
