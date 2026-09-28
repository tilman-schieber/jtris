import { Game, COLS, ROWS, MAX_SCORES } from './game';
import { PIECES, STYLE, PALETTES } from './pieces';
import { drawText, drawTextCentered } from './font';
import { music } from './audio';

export const W = 256;
export const H = 224;
const WHITE = '#fcfcfc';
const RED = '#f83800';
const FIELD_X = 96;
const FIELD_Y = 40;

type Ctx = CanvasRenderingContext2D;

const palette = (level: number) => PALETTES[level % PALETTES.length];

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// Modern mode: one fixed color per piece (T J Z O S L I).
const MODERN = ['#b44cff', '#3a6bff', '#ff3b3b', '#ffd83a', '#3fe05a', '#ff9a2e', '#3ee8f0'];
let modern = false;

function drawModernBlock(ctx: Ctx, x: number, y: number, type: number) {
  const c = MODERN[type];
  ctx.fillStyle = mix(c, '#000000', 0.45);
  ctx.fillRect(x, y, 7, 7);
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 6, 6);
  ctx.fillStyle = mix(c, '#ffffff', 0.5);
  ctx.fillRect(x, y, 6, 1);
  ctx.fillRect(x, y, 1, 6);
  ctx.fillStyle = WHITE;
  ctx.fillRect(x + 1, y + 1, 1, 1);
}

// One 8x8 block tile: 7x7 body plus a 1px gap, with the classic NES shine.
function drawBlock(ctx: Ctx, x: number, y: number, type: number, level: number) {
  if (modern) return drawModernBlock(ctx, x, y, type);
  const [c1, c2] = palette(level);
  const style = STYLE[type];
  ctx.fillStyle = style === 2 ? c2 : c1;
  ctx.fillRect(x, y, 7, 7);
  ctx.fillStyle = WHITE;
  if (style === 0) {
    ctx.fillRect(x + 1, y + 1, 5, 5);
    ctx.fillRect(x, y, 1, 1);
  } else {
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 1, y + 1, 2, 1);
    ctx.fillRect(x + 1, y + 2, 1, 1);
  }
}

function drawPiece(ctx: Ctx, type: number, rot: number, x: number, y: number, level: number) {
  for (const [dx, dy] of PIECES[type][rot]) drawBlock(ctx, x + dx * 8, y + dy * 8, type, level);
}

// Draws a spawn-orientation piece centered in the given box.
function drawPieceCentered(ctx: Ctx, type: number, cx: number, cy: number, level: number) {
  const cells = PIECES[type][0];
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = (maxX - minX + 1) * 8 - 1;
  const h = (maxY - minY + 1) * 8 - 1;
  const ox = Math.round(cx - w / 2) - minX * 8;
  const oy = Math.round(cy - h / 2) - minY * 8;
  drawPiece(ctx, type, 0, ox, oy, level);
}

// Brick wall background, tinted by the level palette. Cached per palette.
const bgCache = new Map<number, HTMLCanvasElement>();
function background(level: number) {
  const key = level % PALETTES.length;
  let c = bgCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const [c1] = palette(level);
  const base = mix(c1, '#282828', 0.78);
  const light = mix(c1, '#707070', 0.7);
  const dark = mix(c1, '#080808', 0.88);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let row = 0; row < H / 8; row++) {
    const off = row % 2 ? 8 : 0;
    for (let bx = -off; bx < W; bx += 16) {
      const y = row * 8;
      g.fillStyle = light;
      g.fillRect(bx, y, 15, 1);
      g.fillRect(bx, y, 1, 7);
      g.fillStyle = dark;
      g.fillRect(bx, y + 7, 16, 1);
      g.fillRect(bx + 15, y, 1, 8);
      // A little speckle so it doesn't look flat.
      g.fillStyle = light;
      g.fillRect(bx + 4 + (row * 5) % 7, y + 3, 1, 1);
      g.fillStyle = dark;
      g.fillRect(bx + 10 - (row * 3) % 5, y + 5, 1, 1);
    }
  }
  bgCache.set(key, c);
  return c;
}

// Framed black panel with rounded corners; (x, y, w, h) is the outer edge.
function drawBox(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const ring = (i: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + i, y + i, w - 2 * i, h - 2 * i);
  };
  ring(0, '#000');
  ring(1, '#bcbcbc');
  ring(2, WHITE);
  ring(3, '#585858');
  ring(4, '#000');
  ctx.fillStyle = '#000';
  for (const [cx, cy] of [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 2], [x + w - 2, y + h - 2]])
    ctx.fillRect(cx, cy, 1, 1);
}

const pad = (n: number, len: number) => String(n).padStart(len, '0');

export function render(ctx: Ctx, game: Game, frame: number) {
  modern = game.colors === 'modern';
  if (game.phase === 'title') return renderTitle(ctx, game, frame);
  if (game.phase === 'entry' || game.phase === 'scores') return renderScores(ctx, game, frame);

  ctx.drawImage(background(game.level), 0, 0);

  // Field
  drawBox(ctx, FIELD_X - 5, FIELD_Y - 5, COLS * 8 + 9, ROWS * 8 + 9);
  const flash = game.phase === 'clear' && game.clearRows.length === 4 && (game.timer >> 2) % 2 === 0;
  if (flash) {
    ctx.fillStyle = mix(palette(game.level)[1], '#ffffff', 0.55);
    ctx.fillRect(FIELD_X, FIELD_Y, COLS * 8, ROWS * 8);
  }

  if (game.paused) {
    drawTextCentered(ctx, 'PAUSE', FIELD_X + 40, FIELD_Y + 72);
    drawTextCentered(ctx, 'PRESS ENTER', FIELD_X + 40, FIELD_Y + 88, '#bcbcbc');
  } else {
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const v = game.board[y][x];
        if (v) drawBlock(ctx, FIELD_X + x * 8, FIELD_Y + y * 8, v - 1, game.level);
      }
    const p = game.piece;
    if (p && game.phase === 'play') {
      for (const [dx, dy] of PIECES[p.type][p.rot])
        if (p.y + dy >= 0) drawBlock(ctx, FIELD_X + (p.x + dx) * 8, FIELD_Y + (p.y + dy) * 8, p.type, game.level);
    }
  }

  if (game.phase === 'curtain' || game.phase === 'over') renderCurtain(ctx, game, frame);

  // Lines
  drawBox(ctx, FIELD_X - 5, 8, COLS * 8 + 9, 23);
  drawTextCentered(ctx, `LINES-${pad(game.lines, 3)}`, FIELD_X + 40, 16);

  // A-Type label
  drawBox(ctx, 8, 8, 76, 23);
  drawTextCentered(ctx, 'A-TYPE', 46, 16);

  // Statistics
  drawBox(ctx, 8, 40, 76, 165);
  drawTextCentered(ctx, 'STATISTICS', 46, 49);
  for (let t = 0; t < 7; t++) {
    const rowY = 62 + t * 20;
    drawPieceCentered(ctx, t, 34, rowY + 7, game.level);
    drawText(ctx, pad(game.stats[t], 3), 58, rowY + 4, RED);
  }

  // Top / score
  drawBox(ctx, 188, 8, 60, 58);
  drawText(ctx, 'TOP', 197, 17);
  drawText(ctx, pad(game.top, 6), 197, 26);
  drawText(ctx, 'SCORE', 197, 41);
  drawText(ctx, pad(game.score, 6), 197, 50);

  // Next
  drawBox(ctx, 188, 80, 60, 52);
  drawText(ctx, 'NEXT', 197, 89);
  if (game.phase !== 'curtain' && game.phase !== 'over' && !game.paused)
    drawPieceCentered(ctx, game.next, 218, 113, game.level);

  // Level
  drawBox(ctx, 188, 140, 60, 34);
  drawText(ctx, 'LEVEL', 197, 149);
  drawText(ctx, pad(game.level, 2), 197, 160);

  // Music indicator
  drawBox(ctx, 188, 182, 60, 23);
  drawText(ctx, music.enabled ? 'MUSIC ON' : 'MUSIC --', 195, 190, music.enabled ? WHITE : '#7c7c7c');
}

function renderCurtain(ctx: Ctx, game: Game, frame: number) {
  const rows = Math.min(ROWS, game.curtainRow);
  for (let y = 0; y < rows; y++) {
    const py = FIELD_Y + y * 8;
    ctx.fillStyle = '#7c7c7c';
    ctx.fillRect(FIELD_X, py, COLS * 8, 8);
    ctx.fillStyle = '#bcbcbc';
    for (let x = 0; x < COLS; x++) ctx.fillRect(FIELD_X + x * 8, py, 7, 1);
    ctx.fillStyle = '#383838';
    for (let x = 0; x < COLS; x++) ctx.fillRect(FIELD_X + x * 8 + 7, py, 1, 8);
    ctx.fillRect(FIELD_X, py + 7, COLS * 8, 1);
  }
  if (game.phase === 'over') {
    drawBox(ctx, FIELD_X + 4, FIELD_Y + 52, 72, 60);
    drawTextCentered(ctx, 'GAME', FIELD_X + 40, FIELD_Y + 62);
    drawTextCentered(ctx, 'OVER', FIELD_X + 40, FIELD_Y + 72);
    if ((frame >> 5) % 2 === 0) {
      drawTextCentered(ctx, 'PRESS', FIELD_X + 40, FIELD_Y + 88, '#bcbcbc');
      drawTextCentered(ctx, 'ENTER', FIELD_X + 40, FIELD_Y + 97, '#bcbcbc');
    }
  }
}

const LOGO: string[][] = [
  ['###', '..#', '..#', '#.#', '.#.'],
  ['###', '.#.', '.#.', '.#.', '.#.'],
  ['##.', '#.#', '##.', '#.#', '#.#'],
  ['###', '.#.', '.#.', '.#.', '###'],
  ['.##', '#..', '.#.', '..#', '##.'],
];
const LOGO_TYPES = [0, 2, 6, 1, 4];
const LOGO_X = (W - (LOGO.length * 4 - 1) * 8) / 2;

function renderTitle(ctx: Ctx, game: Game, frame: number) {
  const lvl = game.startLevel;
  ctx.drawImage(background(lvl), 0, 0);

  drawBox(ctx, 24, 10, 208, 64);
  LOGO.forEach((letter, i) => {
    letter.forEach((row, y) =>
      [...row].forEach((c, x) => c === '#' && drawBlock(ctx, LOGO_X + (i * 4 + x) * 8, 22 + y * 8, LOGO_TYPES[i], lvl)),
    );
  });

  drawBox(ctx, 64, 84, 128, 66);
  drawTextCentered(ctx, 'LEVEL', 128, 93);
  const [c1] = palette(lvl);
  for (let i = 0; i < 10; i++) {
    const x = 88 + (i % 5) * 16;
    const y = 106 + Math.floor(i / 5) * 16;
    ctx.fillStyle = '#585858';
    ctx.fillRect(x, y, 16, 16);
    const selected = i === lvl;
    ctx.fillStyle = selected && (frame >> 3) % 2 === 0 ? c1 : '#000';
    ctx.fillRect(x + 1, y + 1, 14, 14);
    drawText(ctx, String(i), x + 6, y + 5, selected ? WHITE : '#bcbcbc');
  }

  drawBox(ctx, 16, 158, 224, 60);
  const best = game.scores[0];
  drawTextCentered(ctx, best ? `TOP ${pad(best.score, 6)} ${best.name}` : 'TOP 000000', 128, 164, RED);
  if ((frame >> 5) % 2 === 0) drawTextCentered(ctx, 'PRESS ENTER', 128, 175);
  drawTextCentered(ctx, 'ARROWS MOVE/DROP  X Z ROTATE', 128, 187, '#bcbcbc');
  drawTextCentered(ctx, 'ENTER PAUSE  M MUSIC  H SCORES', 128, 197, '#bcbcbc');
  drawText(ctx, 'C COLORS:', 64, 207, '#bcbcbc');
  drawText(ctx, modern ? 'MODERN' : 'CLASSIC', 124, 207, modern ? MODERN[3] : WHITE);
}

function renderScores(ctx: Ctx, game: Game, frame: number) {
  const entering = game.phase === 'entry';
  const lvl = game.entryRank >= 0 ? game.level : game.startLevel;
  ctx.drawImage(background(lvl), 0, 0);

  drawBox(ctx, 28, 12, 200, 176);
  drawTextCentered(ctx, entering ? 'NEW HIGH SCORE!' : 'HIGH SCORES', 128, 22, entering ? MODERN[3] : WHITE);
  const GREY = '#7c7c7c';
  drawText(ctx, 'NAME', 62, 38, GREY);
  drawText(ctx, 'SCORE', 108, 38, GREY);
  drawText(ctx, 'LIN', 150, 38, GREY);
  drawText(ctx, 'LV', 180, 38, GREY);
  ctx.fillStyle = '#585858';
  ctx.fillRect(38, 48, 180, 1);

  const blink = (frame >> 4) % 2 === 0;
  for (let i = 0; i < MAX_SCORES; i++) {
    const y = 54 + i * 13;
    const e = game.scores[i];
    const mine = i === game.entryRank;
    const color = mine ? (entering || blink ? MODERN[3] : WHITE) : i < 3 ? WHITE : '#bcbcbc';
    drawText(ctx, String(i + 1).padStart(2, ' '), 40, y, mine ? color : GREY);
    if (!e) {
      drawText(ctx, '------', 62, y, '#383838');
      continue;
    }
    if (mine && entering) {
      drawText(ctx, game.entryName.join(''), 62, y, color);
      if (blink) {
        ctx.fillStyle = WHITE;
        ctx.fillRect(62 + game.entryCursor * 6, y + 8, 5, 1);
      }
    } else drawText(ctx, e.name, 62, y, color);
    drawText(ctx, pad(e.score, 6), 108, y, color);
    drawText(ctx, pad(e.lines, 3), 150, y, color);
    drawText(ctx, pad(e.level, 2), 180, y, color);
  }

  drawBox(ctx, 28, 194, 200, 24);
  if (entering) drawTextCentered(ctx, 'TYPE NAME  THEN ENTER', 128, 202);
  else if (blink) drawTextCentered(ctx, 'PRESS ENTER', 128, 202);
}
