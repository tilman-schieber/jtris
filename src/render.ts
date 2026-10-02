import { Game, MENU, NAME_LEN, formatClock, rocketTop } from './game';
import { Player, COLS, ROWS } from './player';
import { MODES, B_HEIGHTS } from './modes';
import { MAX_SCORES } from './scores';
import { HELP_PAGES, wrapText } from './help';
import { drawText, drawTextCentered, textWidth } from './font';
import {
  Ctx, W, H, WHITE, RED, GREY, LIGHT, DARK, YELLOW, MODERN_COLORS,
  palette, mix, blockColor, drawBlock, drawGhost, background, drawBox, pad,
} from './draw';
import rocketUrl from './assets/rocket.png';

export { W, H };

const rocket = new Image();
rocket.src = rocketUrl;

let modern = false;

/** Held player-1 actions, set by main for the input display. */
let heldForDisplay: Set<string> = new Set();
export const setHeldForDisplay = (s: Set<string>) => (heldForDisplay = s);

// Single-player field position.
const FX = 96;
const FY = 40;

/** Field origin per player index. */
function fieldOrigin(game: Game, i: number): [number, number] {
  if (!game.versus) return [FX, FY];
  return i === 0 ? [44, 32] : [132, 32];
}

function drawPiece(ctx: Ctx, p: Player, type: number, rot: number, x: number, y: number, level: number) {
  for (const [dx, dy] of p.pieces[type][rot]) drawBlock(ctx, x + dx * 8, y + dy * 8, type, level, modern);
}

// Draws a spawn-orientation piece centered on (cx, cy).
function drawPieceCentered(ctx: Ctx, p: Player, type: number, cx: number, cy: number, level: number) {
  const cells = p.pieces[type][0];
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = (maxX - minX + 1) * 8 - 1;
  const h = (maxY - minY + 1) * 8 - 1;
  drawPiece(ctx, p, type, 0, Math.round(cx - w / 2) - minX * 8, Math.round(cy - h / 2) - minY * 8, level);
}

function rightText(ctx: Ctx, s: string, right: number, y: number, color?: string) {
  drawText(ctx, s, right - textWidth(s), y, color);
}

export function render(ctx: Ctx, game: Game, frame: number) {
  modern = game.colors === 'modern';
  ctx.save();
  if (game.shake > 0) ctx.translate(frame % 2 ? 1 : -1, Math.min(2, game.shake >> 2) * (frame % 4 < 2 ? 1 : -1));

  switch (game.phase) {
    case 'title':
      renderTitle(ctx, game, frame);
      break;
    case 'entry':
    case 'scores':
      renderScores(ctx, game, frame);
      break;
    case 'ending':
      renderEnding(ctx, game, frame);
      break;
    case 'help':
      renderHelp(ctx, game, frame);
      break;
    default:
      if (game.versus) renderVersus(ctx, game, frame);
      else renderSingle(ctx, game, frame);
  }
  ctx.restore();
}

// ---------- shared field ----------

function drawField(ctx: Ctx, game: Game, i: number, frame: number) {
  const p = game.players[i];
  const [ox, oy] = fieldOrigin(game, i);
  const flash = p.state === 'clear' && p.clearRows.length === 4 && (p.timer >> 2) % 2 === 0;
  if (flash) {
    ctx.fillStyle = modern ? '#1c2a4a' : mix(palette(p.level)[1], '#ffffff', 0.55);
    ctx.fillRect(ox, oy, COLS * 8, ROWS * 8);
  }

  if (game.paused) {
    drawTextCentered(ctx, 'PAUSE', ox + 40, oy + 64);
    drawTextCentered(ctx, 'ENTER', ox + 40, oy + 84, LIGHT);
    drawTextCentered(ctx, 'RESUME', ox + 40, oy + 93, LIGHT);
    drawTextCentered(ctx, 'BKSP', ox + 40, oy + 109, GREY);
    drawTextCentered(ctx, 'QUIT', ox + 40, oy + 118, GREY);
    return;
  }

  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const v = p.board[y][x];
      if (!v) continue;
      // The invisible roll still shows rows as they clear.
      if (p.invisible && !p.clearRows.includes(y)) continue;
      drawBlock(ctx, ox + x * 8, oy + y * 8, v - 1, p.level, modern);
    }

  const piece = p.piece;
  if (piece && p.state === 'play') {
    if (p.cfg.modern) {
      const gy = p.dropY();
      if (gy !== piece.y) {
        const color = blockColor(piece.type, p.level, modern);
        for (const [x, y] of p.cells({ ...piece, y: gy })) if (y >= 0) drawGhost(ctx, ox + x * 8, oy + y * 8, color);
      }
    }
    for (const [x, y] of p.cells(piece)) if (y >= 0) drawBlock(ctx, ox + x * 8, oy + y * 8, piece.type, p.level, modern);
  }

  for (const pt of game.particles) {
    if (pt.field !== i) continue;
    ctx.fillStyle = pt.color;
    ctx.fillRect(Math.round(ox + pt.x), Math.round(oy + pt.y), pt.size, pt.size);
  }

  // Popups (T-spins, combos, ...), newest at the bottom.
  p.popups.forEach((pop, k) => {
    if (pop.timer < 20 && (frame >> 1) % 2) return;
    const y = oy + 24 + k * 11;
    const w = textWidth(pop.text);
    ctx.fillStyle = '#000';
    ctx.fillRect(Math.round(ox + 40 - w / 2) - 2, y - 2, w + 4, 11);
    drawTextCentered(ctx, pop.text, ox + 40, y, pop.color);
  });

  if (game.phase === 'ready') {
    drawTextCentered(ctx, 'READY', ox + 40, oy + 76, YELLOW);
  } else if (game.goFlash > 0 && (game.goFlash >> 2) % 2 === 0) {
    drawTextCentered(ctx, 'GO!', ox + 40, oy + 76, YELLOW);
  }

  const dead = game.versus && !p.alive;
  if (game.phase === 'curtain' || game.phase === 'over' || dead) drawCurtain(ctx, game, ox, oy, frame, dead);
}

function drawCurtain(ctx: Ctx, game: Game, ox: number, oy: number, frame: number, dead: boolean) {
  const rows = dead ? ROWS : Math.min(ROWS, game.curtainRow);
  for (let y = 0; y < rows; y++) {
    const py = oy + y * 8;
    ctx.fillStyle = GREY;
    ctx.fillRect(ox, py, COLS * 8, 8);
    ctx.fillStyle = LIGHT;
    for (let x = 0; x < COLS; x++) ctx.fillRect(ox + x * 8, py, 7, 1);
    ctx.fillStyle = DARK;
    for (let x = 0; x < COLS; x++) ctx.fillRect(ox + x * 8 + 7, py, 1, 8);
    ctx.fillRect(ox, py + 7, COLS * 8, 1);
  }
  if (game.phase === 'over' || dead) {
    drawBox(ctx, ox + 4, oy + 52, 72, 60);
    drawTextCentered(ctx, 'GAME', ox + 40, oy + 62);
    drawTextCentered(ctx, 'OVER', ox + 40, oy + 72);
    if (game.phase === 'over' && (frame >> 5) % 2 === 0) {
      drawTextCentered(ctx, 'PRESS', ox + 40, oy + 88, LIGHT);
      drawTextCentered(ctx, 'ENTER', ox + 40, oy + 97, LIGHT);
    }
  }
}

// ---------- single player ----------

function renderSingle(ctx: Ctx, game: Game, frame: number) {
  const p = game.players[0];
  const mode = game.mode;
  ctx.drawImage(background(p.level), 0, 0);

  drawBox(ctx, FX - 5, FY - 5, COLS * 8 + 9, ROWS * 8 + 9);
  drawField(ctx, game, 0, frame);

  // Lines, counting down in modes with a goal.
  drawBox(ctx, FX - 5, 8, COLS * 8 + 9, 23);
  let linesText = `LINES-${pad(p.lines, 3)}`;
  if (mode.id === 'b' || mode.id === 'sprint') linesText = `LINES-${pad(Math.max(0, mode.goal! - p.lines), 2)}`;
  if (mode.id === 'master' && game.rollTimer >= 0) linesText = `ROLL ${formatClock(game.rollTimer).slice(0, 4)}`;
  drawTextCentered(ctx, linesText, FX + 40, 16);

  drawBox(ctx, 8, 8, 76, 23);
  drawTextCentered(ctx, mode.name, 46, 16);

  if (p.cfg.modern) {
    drawBox(ctx, 8, 40, 76, 44);
    drawText(ctx, 'HOLD', 17, 48);
    if (p.hold !== null) {
      ctx.globalAlpha = p.holdUsed ? 0.4 : 1;
      drawPieceCentered(ctx, p, p.hold, 46, 68, p.level);
      ctx.globalAlpha = 1;
    }
    drawBox(ctx, 8, 90, 76, 115);
    drawStatLines(ctx, game, p, 99);
  } else {
    drawBox(ctx, 8, 40, 76, 134);
    drawTextCentered(ctx, 'STATISTICS', 46, 47);
    for (let t = 0; t < 7; t++) {
      const rowY = 57 + t * 16;
      drawPieceCentered(ctx, p, t, 34, rowY + 7, p.level);
      drawText(ctx, pad(p.stats[t], 3), 58, rowY + 4, RED);
    }
    drawBox(ctx, 8, 176, 76, 29);
    drawText(ctx, `TRT ${pad(p.tetrisRate, 2)}%`, 16, 182);
    drawText(ctx, `DRT ${pad(p.drought, 2)}`, 16, 192, p.drought >= 13 ? RED : WHITE);
  }

  drawScoreBox(ctx, game, p);

  const hidePreview = game.phase === 'curtain' || game.phase === 'over' || game.paused;
  if (p.cfg.modern) {
    drawBox(ctx, 188, 72, 60, 114);
    drawText(ctx, 'NEXT', 197, 81);
    if (!hidePreview) {
      p.preview.forEach((t, k) => drawPieceCentered(ctx, p, t, 218, 99 + k * 18, p.level));
      if (p.cfg.hate) drawTextCentered(ctx, '???', 218, 110, GREY);
    }
    drawBox(ctx, 188, 188, 60, 17);
    drawText(ctx, `LV ${pad(p.level, 2)}`, 197, 193);
  } else {
    drawBox(ctx, 188, 72, 60, 52);
    drawText(ctx, 'NEXT', 197, 81);
    if (!hidePreview) {
      if (p.cfg.hate) drawTextCentered(ctx, '???', 218, 102, GREY);
      else if (p.preview[0] !== undefined) drawPieceCentered(ctx, p, p.preview[0], 218, 105, p.level);
    }
    drawBox(ctx, 188, 130, 60, 34);
    drawText(ctx, 'LEVEL', 197, 139);
    drawText(ctx, pad(p.level, 2), 197, 150);
    drawInputDisplay(ctx, p);
  }

  if (game.phase === 'result') drawResult(ctx, game, frame);
}

function drawStatLines(ctx: Ctx, game: Game, p: Player, y: number) {
  const seconds = game.frames / 60;
  const lines: [string, string, string?][] = [
    ['TRT', `${p.tetrisRate}%`],
    ['DRT', String(p.drought), p.drought >= 13 ? RED : undefined],
    ['PPS', seconds > 0 ? (p.piecesPlaced / seconds).toFixed(2) : '0.00'],
    ['PCS', String(p.piecesPlaced)],
    ['B2B', p.b2b ? 'ON' : '--', p.b2b ? YELLOW : undefined],
    ['CMB', p.combo > 0 ? String(p.combo) : '--'],
  ];
  if (p.cfg.twentyG) lines.push(['GRV', '20G', RED]);
  lines.forEach(([k, v, c], i) => {
    drawText(ctx, k, 16, y + i * 12, GREY);
    rightText(ctx, v, 76, y + i * 12, c ?? WHITE);
  });
}

function drawScoreBox(ctx: Ctx, game: Game, p: Player) {
  const mode = game.mode;
  const best = game.best();
  drawBox(ctx, 188, 8, 60, 58);
  let rows: [string, string][];
  if (mode.id === 'sprint') rows = [['TIME', formatClock(game.frames)], ['BEST', best ? formatClock(best.time) : '-:--.--']];
  else if (mode.id === 'ultra')
    rows = [['TIME', formatClock(Math.max(0, mode.timeLimit! - game.frames))], ['SCORE', pad(p.score, 6)]];
  else if (mode.id === 'hate') rows = [['BEST', pad(best?.lines ?? 0, 3)], ['LINES', pad(p.lines, 3)]];
  else rows = [['TOP', pad(Math.max(best?.score ?? 0, p.score), 6)], ['SCORE', pad(p.score, 6)]];
  drawText(ctx, rows[0][0], 197, 17);
  drawText(ctx, rows[0][1], 197, 26);
  drawText(ctx, rows[1][0], 197, 41);
  drawText(ctx, rows[1][1], 197, 50);
}

// CTWC-style controller display: d-pad, B/A and the DAS charge meter.
function drawInputDisplay(ctx: Ctx, p: Player) {
  drawBox(ctx, 188, 170, 60, 35);
  const held = heldForDisplay;
  const key = (x: number, y: number, on: boolean) => {
    ctx.fillStyle = on ? WHITE : DARK;
    ctx.fillRect(x, y, 6, 6);
  };
  key(195, 180, held.has('left'));
  key(209, 180, held.has('right'));
  key(202, 186, held.has('down'));
  key(202, 174, false);
  key(224, 182, held.has('ccw'));
  key(234, 178, held.has('cw'));
  drawText(ctx, 'B', 224, 190, GREY);
  drawText(ctx, 'A', 234, 186, GREY);
  // DAS meter: full once auto-shift is charged.
  const charged = p.das >= 10;
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i < p.das ? (charged ? '#3fe05a' : RED) : DARK;
    ctx.fillRect(195 + i * 3, 198, 2, 3);
  }
}

function drawResult(ctx: Ctx, game: Game, frame: number) {
  const { title, rows } = game.result;
  const h = 44 + rows.length * 11;
  const y0 = Math.round(112 - h / 2);
  drawBox(ctx, 52, y0, 152, h);
  drawTextCentered(ctx, title, 128, y0 + 9, YELLOW);
  rows.forEach(([k, v], i) => {
    drawText(ctx, k, 64, y0 + 24 + i * 11, GREY);
    rightText(ctx, v, 192, y0 + 24 + i * 11);
  });
  if (game.timer > 30 && (frame >> 5) % 2 === 0) drawTextCentered(ctx, 'PRESS ENTER', 128, y0 + h - 14, LIGHT);
}

// ---------- versus ----------

function renderVersus(ctx: Ctx, game: Game, frame: number) {
  ctx.drawImage(background(game.players[0].level), 0, 0);
  game.players.forEach((p, i) => {
    const bx = i === 0 ? 40 : 128;
    const side = i === 0 ? 0 : 216;
    drawBox(ctx, bx, 4, 88, 22);
    drawText(ctx, `${i + 1}P`, bx + 8, 11, i === 0 ? '#3ee8f0' : '#ff9a2e');
    rightText(ctx, `LINES ${pad(p.lines, 3)}`, bx + 80, 11);
    drawBox(ctx, bx, 28, 88, 168);
    drawField(ctx, game, i, frame);

    const cx = side + 20;
    drawBox(ctx, side, 28, 40, 36);
    drawTextCentered(ctx, 'NEXT', cx, 36);
    if (p.preview[0] !== undefined && !game.paused) drawPieceCentered(ctx, p, p.preview[0], cx, 53, p.level);
    drawBox(ctx, side, 66, 40, 36);
    if (p.cfg.modern) {
      drawTextCentered(ctx, 'HOLD', cx, 74);
      if (p.hold !== null && !game.paused) drawPieceCentered(ctx, p, p.hold, cx, 91, p.level);
    } else {
      drawTextCentered(ctx, 'TRT', cx, 74, GREY);
      drawTextCentered(ctx, `${p.tetrisRate}%`, cx, 86);
    }
    drawBox(ctx, side, 104, 40, 30);
    drawTextCentered(ctx, 'GARB', cx, 112, GREY);
    drawTextCentered(ctx, String(p.garbage), cx, 122, p.garbage ? RED : WHITE);
    drawBox(ctx, side, 136, 40, 30);
    drawTextCentered(ctx, 'WINS', cx, 144, GREY);
    drawTextCentered(ctx, String(game.wins[i]), cx, 154, YELLOW);
    drawBox(ctx, side, 168, 40, 28);
    drawTextCentered(ctx, 'LV', cx, 175, GREY);
    drawTextCentered(ctx, pad(p.level, 2), cx, 185);
  });

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 199, W, 25);
  drawText(ctx, '1P WASD  Q CCW  SPACE DROP  E HOLD', 4, 203, LIGHT);
  drawText(ctx, '2P ARROWS  . CCW  RSHIFT DROP  / HOLD', 4, 213, LIGHT);

  if (game.phase === 'vsresult') {
    drawBox(ctx, 56, 70, 144, 76);
    const text = game.winner < 0 ? 'DRAW!' : `${game.winner + 1}P WINS!`;
    drawTextCentered(ctx, text, 128, 80, YELLOW);
    drawTextCentered(ctx, `${game.wins[0]} - ${game.wins[1]}`, 128, 96);
    if (game.timer > 30) {
      drawTextCentered(ctx, 'ENTER REMATCH', 128, 114, LIGHT);
      drawTextCentered(ctx, 'ESC MENU', 128, 126, GREY);
    }
  }
}

// ---------- title ----------

const LOGO: string[][] = [
  ['###', '..#', '..#', '#.#', '.#.'],
  ['###', '.#.', '.#.', '.#.', '.#.'],
  ['##.', '#.#', '##.', '#.#', '#.#'],
  ['###', '.#.', '.#.', '.#.', '###'],
  ['.##', '#..', '.#.', '..#', '##.'],
];
const LOGO_TYPES = [0, 2, 6, 1, 4];
const LOGO_X = (W - (LOGO.length * 4 - 1) * 8) / 2;
const MUSIC_LABELS = ['A KOROBEINIKI', 'B MINUET', 'C MTN KING', 'ALL A-B-C', 'OFF'];

function renderTitle(ctx: Ctx, game: Game, frame: number) {
  const s = game.settings;
  const lvl = s.level;
  ctx.drawImage(background(lvl), 0, 0);

  drawBox(ctx, 24, 6, 208, 56);
  LOGO.forEach((letter, i) =>
    letter.forEach((row, y) =>
      [...row].forEach((c, x) => c === '#' && drawBlock(ctx, LOGO_X + (i * 4 + x) * 8, 14 + y * 8, LOGO_TYPES[i], lvl, modern)),
    ),
  );

  drawBox(ctx, 24, 66, 208, 112);
  const mode = game.mode;
  const values: Record<(typeof MENU)[number], string> = {
    MODE: mode.name,
    LEVEL: mode.usesLevel ? pad(s.level, 2) : '--',
    HEIGHT: mode.usesHeight ? String(B_HEIGHTS[s.height]) : '--',
    RULES: game.modern ? 'MODERN' : 'CLASSIC',
    COLORS: s.colors === 'modern' ? 'MODERN' : 'CLASSIC',
    MUSIC: MUSIC_LABELS[s.music],
    SEED: mode.id === 'hate' ? '--' : s.daily ? 'DAILY' : 'RANDOM',
    HELP: 'HOW TO PLAY',
  };
  MENU.forEach((row, i) => {
    const y = 74 + i * 12;
    const on = i === game.menuRow;
    const enabled = game.rowEnabled(row);
    if (on) drawText(ctx, '>', 34, y, YELLOW);
    drawText(ctx, row, 44, y, on ? YELLOW : enabled ? WHITE : '#585858');
    const v = values[row];
    drawText(ctx, v, 120, y, !enabled ? '#585858' : on ? WHITE : LIGHT);
    if (on && enabled) {
      drawText(ctx, '<', 111, y, GREY);
      drawText(ctx, '>', 122 + textWidth(v), y, GREY);
    }
  });

  drawBox(ctx, 8, 182, 240, 40);
  const best = game.best();
  let top = 'NO RECORD YET';
  if (mode.rank === 'none') top = 'LOCAL 2 PLAYER';
  else if (best && mode.rank === 'time') top = `BEST ${formatClock(best.time)} ${best.name}`;
  else if (best && mode.rank === 'lines') top = `BEST ${best.lines} LINES ${best.name}`;
  else if (best) top = `TOP ${pad(best.score, 6)} ${best.name}`;
  drawTextCentered(ctx, top, 128, 188, RED);
  if ((frame >> 5) % 2 === 0) drawTextCentered(ctx, 'ENTER START   H SCORES   M MUTE', 128, 199);
  drawTextCentered(ctx, 'X Z ROTATE  SPACE DROP  SHIFT HOLD', 128, 210, GREY);
}

// ---------- high scores ----------

function renderScores(ctx: Ctx, game: Game, frame: number) {
  const entering = game.phase === 'entry';
  const mode = MODES[game.scoresView];
  ctx.drawImage(background(game.players[0]?.level ?? game.settings.level), 0, 0);

  drawBox(ctx, 24, 12, 208, 176);
  // The name is typed into your own table; afterwards the world table shows by default.
  const world = game.scoresGlobal && !entering;
  const title = entering ? 'NEW RECORD!' : world ? 'WORLD SCORES' : 'LOCAL SCORES';
  drawTextCentered(ctx, title, 128, 20, entering ? YELLOW : WHITE);
  drawTextCentered(ctx, entering ? mode.name : `< ${mode.name} >`, 128, 32, LIGHT);

  const time = mode.rank === 'time';
  const byLines = mode.rank === 'lines';
  const cols: [string, number][] = time
    ? [['NAME', 50], ['TIME', 94], ['LIN', 146], ['R', 196]]
    : byLines
      ? [['NAME', 50], ['LINES', 94], ['SCORE', 132], ['R', 196]]
      : [['NAME', 50], ['SCORE', 94], ['LIN', 142], ['LV', 166], ['R', 196]];
  for (const [label, x] of cols) drawText(ctx, label, x, 44, GREY);
  ctx.fillStyle = '#585858';
  ctx.fillRect(34, 53, 188, 1);

  const blink = (frame >> 4) % 2 === 0;
  if (world && !game.global) {
    drawTextCentered(ctx, game.globalState === 'loading' ? 'LOADING...' : 'OFFLINE', 128, 110, game.globalState === 'loading' ? LIGHT : RED);
  }
  const list = world ? (game.global?.[mode.id] ?? []) : game.tables[mode.id];
  const myRow = world ? game.globalRank : game.entryRank;
  for (let i = 0; i < MAX_SCORES && (!world || game.global); i++) {
    const y = 58 + i * 12;
    const e = list[i];
    const mine = i === myRow && game.scoresView === game.settings.mode;
    const color = mine ? (entering || blink ? YELLOW : WHITE) : i < 3 ? WHITE : LIGHT;
    rightText(ctx, String(i + 1), 45, y, mine ? color : GREY);
    if (!e) {
      drawText(ctx, '------', 50, y, DARK);
      continue;
    }
    if (mine && entering) {
      drawText(ctx, game.entryName.join(''), 50, y, color);
      if (blink) {
        ctx.fillStyle = WHITE;
        ctx.fillRect(50 + game.entryCursor * 6, y + 8, 5, 1);
      }
    } else drawText(ctx, e.name.slice(0, NAME_LEN), 50, y, color);
    if (time) {
      drawText(ctx, formatClock(e.time), 94, y, color);
      drawText(ctx, pad(e.lines, 3), 146, y, color);
    } else if (byLines) {
      drawText(ctx, pad(e.lines, 3), 94, y, color);
      drawText(ctx, pad(e.score, 6), 132, y, color);
    } else {
      drawText(ctx, pad(e.score, 7), 94, y, color);
      drawText(ctx, pad(e.lines, 3), 142, y, color);
      drawText(ctx, pad(e.level, 2), 166, y, color);
    }
    drawText(ctx, e.rules, 196, y, e.rules === 'M' ? '#3ee8f0' : GREY);
  }

  drawBox(ctx, 24, 194, 208, 24);
  if (entering) drawTextCentered(ctx, 'TYPE NAME  THEN ENTER', 128, 202);
  else drawTextCentered(ctx, `< > MODE   UP ${world ? 'LOCAL' : 'WORLD'}   ENTER`, 128, 202, blink ? WHITE : LIGHT);
}

// ---------- ending: rocket launch ----------

const SKY = ['#06061a', '#0c0c2c', '#141440', '#1e1e56', '#2a2a6c'];
const STARS = Array.from({ length: 60 }, (_, i) => [(i * 97 + 13) % W, (i * 53 + 7) % 170, i % 5] as const);

function renderEnding(ctx: Ctx, game: Game, frame: number) {
  const t = game.timer;
  // Banded night sky with a dithered seam between bands.
  const band = 192 / SKY.length;
  SKY.forEach((c, i) => {
    const y = Math.floor(i * band);
    ctx.fillStyle = c;
    ctx.fillRect(0, y, W, Math.ceil(band) + 1);
    if (i > 0) for (let x = i % 2; x < W; x += 2) ctx.fillRect(x, y - 1, 1, 1);
  });
  for (const [x, y, k] of STARS) {
    ctx.fillStyle = (frame + k * 7) % 40 < 4 ? '#585858' : k === 0 ? WHITE : LIGHT;
    ctx.fillRect(x, y, 1, 1);
  }

  // Ground and launch tower.
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 192, W, 32);
  ctx.fillStyle = DARK;
  for (let x = 0; x < W; x += 8) ctx.fillRect(x, 193, 7, 3);
  ctx.fillStyle = GREY;
  ctx.fillRect(0, 191, W, 1);
  ctx.fillStyle = LIGHT;
  ctx.fillRect(98, 118, 2, 74);
  ctx.fillRect(104, 118, 2, 74);
  ctx.fillStyle = GREY;
  for (let y = 120; y < 190; y += 8) {
    for (let k = 0; k < 6; k++) ctx.fillRect(100 + (k >> 1) * 2, y + k, 2, 1);
    ctx.fillRect(98, y + 7, 8, 1);
  }
  // Service arm retracts before lift-off.
  if (t < 150) ctx.fillRect(106, 140, 10, 2);
  ctx.fillStyle = '#585858';
  ctx.fillRect(108, 188, 40, 4);

  for (const pt of game.particles) {
    if (pt.field !== -1) continue;
    ctx.globalAlpha = Math.min(1, pt.life / 15);
    ctx.fillStyle = pt.color;
    ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  if (rocket.complete) ctx.drawImage(rocket, 112, Math.round(rocketTop(t)));

  if (t > 40) {
    const c = MODERN_COLORS[(frame >> 3) % MODERN_COLORS.length];
    drawTextCentered(ctx, 'CONGRATULATIONS', 128, 14, c);
    drawTextCentered(ctx, game.result.title, 128, 26, WHITE);
  }
  if (t > 60 && (frame >> 5) % 2 === 0) drawTextCentered(ctx, 'PRESS ENTER', 128, 206, LIGHT);
}

// ---------- help ----------

function renderHelp(ctx: Ctx, game: Game, frame: number) {
  const page = HELP_PAGES[game.helpPage];
  ctx.drawImage(background(game.settings.level), 0, 0);
  drawBox(ctx, 16, 8, 224, 182);
  drawTextCentered(ctx, `< ${page.title} >`, 128, 16, YELLOW);
  ctx.fillStyle = '#585858';
  ctx.fillRect(26, 27, 204, 1);
  wrapText(page.text, 34).forEach((line, i) => drawText(ctx, line, 26, 34 + i * 10));

  drawBox(ctx, 16, 194, 224, 24);
  const blink = (frame >> 4) % 2 === 0;
  drawTextCentered(ctx, `< > PAGE ${game.helpPage + 1}/${HELP_PAGES.length}    ENTER BACK`, 128, 202, blink ? WHITE : LIGHT);
}
