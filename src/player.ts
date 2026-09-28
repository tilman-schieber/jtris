import { NES_PIECES, SRS_PIECES, NES_SPAWN, SRS_SPAWN, srsKicks, Cell, T, I } from './pieces';
import { makeRng, Rng } from './rng';
import { sfx } from './audio';

export const COLS = 10;
export const ROWS = 20;

// NES frames-per-cell gravity table (levels 0-28, 29+ = 1).
const NES_GRAVITY = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
const NES_LINE_SCORE = [0, 40, 100, 300, 1200];
const NES_DAS = 16;
const NES_ARR = 6;

// Guideline-style timings for modern rules.
const MODERN_DAS = 10;
const MODERN_ARR = 2;
const LOCK_DELAY = 30;
const MAX_LOCK_RESETS = 15;
const MODERN_ARE = 6;
const QUEUE_SIZE = 5;

export type PAction = 'left' | 'right' | 'down' | 'cw' | 'ccw' | 'hard' | 'hold';
export interface PInput {
  held: Set<PAction>;
  pressed: Set<PAction>;
}

export type PState = 'play' | 'clear' | 'are' | 'dead' | 'idle';
export type TSpin = 'none' | 'mini' | 'full';

export interface Piece {
  type: number;
  rot: number;
  x: number;
  y: number;
}

export interface ClearEvent {
  lines: number;
  tspin: TSpin;
  b2b: boolean;
  combo: number;
  perfect: boolean;
  /** Cleared cells, for particles. */
  cells: { x: number; y: number; type: number }[];
}

export interface PlayerConfig {
  modern: boolean;
  startLevel: number;
  seed: number;
  /** Rows of B-Type garbage to start with. */
  garbageHeight: number;
  /** Fixed level (B-Type keeps its level). */
  fixedLevel: boolean;
  twentyG: boolean;
  hate: boolean;
}

export interface Popup {
  text: string;
  color: string;
  timer: number;
}

export class Player {
  readonly cfg: PlayerConfig;
  readonly pieces: Cell[][][];
  board: number[][] = emptyBoard();
  piece: Piece | null = null;
  queue: number[] = [];
  hold: number | null = null;
  holdUsed = false;
  stats = new Array(7).fill(0);
  level: number;
  lines = 0;
  score = 0;
  state: PState = 'idle';
  clearRows: number[] = [];
  timer = 0;
  /** Stack hidden (20G roll). */
  invisible = false;
  popups: Popup[] = [];
  /** Incoming garbage lines waiting to rise. */
  garbage = 0;

  // CTWC-style stats
  tetrisLines = 0;
  drought = 0;
  maxDrought = 0;
  piecesPlaced = 0;
  combo = -1;
  b2b = false;

  /** Latest cleared-lines event, consumed by the game each frame. */
  events: ClearEvent[] = [];
  /** DAS charge for the input display. */
  das = 0;

  private rng: Rng;
  private garbageRng: Rng;
  private lastRoll = -1;
  private bag: number[] = [];
  private gravCounter = 0;
  private gravAcc = 0;
  private softCounter = 0;
  private downArmed = false;
  private pushdown = 0;
  private areDelay = 10;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private lastRotate = false;
  private lastKick = 0;

  constructor(cfg: PlayerConfig) {
    this.cfg = cfg;
    this.pieces = cfg.modern ? SRS_PIECES : NES_PIECES;
    this.level = cfg.startLevel;
    this.rng = makeRng(cfg.seed);
    this.garbageRng = makeRng(cfg.seed ^ 0x9e3779b9);
    if (cfg.garbageHeight) this.fillGarbage(cfg.garbageHeight);
    if (!cfg.hate) this.fillQueue();
  }

  start() {
    this.spawn();
  }

  get alive() {
    return this.state !== 'dead';
  }

  get tetrisRate() {
    return this.lines ? Math.round((this.tetrisLines / this.lines) * 100) : 0;
  }

  /** Next pieces to show (none in HATE mode). */
  get preview() {
    return this.cfg.hate ? [] : this.queue.slice(0, this.cfg.modern ? QUEUE_SIZE : 1);
  }

  step(input: PInput) {
    for (const p of this.popups) p.timer--;
    this.popups = this.popups.filter((p) => p.timer > 0);

    const { held } = input;
    const dasMax = this.cfg.modern ? MODERN_DAS : NES_DAS;
    switch (this.state) {
      case 'play':
        return this.cfg.modern ? this.stepModern(input) : this.stepClassic(input);
      case 'clear':
        if (held.has('left') !== held.has('right')) this.das = Math.min(dasMax, this.das + 1);
        return this.stepClear();
      case 'are':
        // DAS keeps charging between pieces, like on the NES.
        if (held.has('left') !== held.has('right')) this.das = Math.min(dasMax, this.das + 1);
        if (--this.timer <= 0) this.spawn();
        return;
    }
  }

  // ---------- pieces ----------

  private fillQueue() {
    while (this.queue.length < QUEUE_SIZE + 1) this.queue.push(this.cfg.modern ? this.fromBag() : this.nesRoll());
  }

  // NES randomizer: roll 0-7; on 7 or a repeat, reroll once over 0-6.
  private nesRoll() {
    let r = Math.floor(this.rng() * 8);
    if (r === 7 || r === this.lastRoll) r = Math.floor(this.rng() * 7);
    this.lastRoll = r;
    return r;
  }

  private fromBag() {
    if (!this.bag.length) {
      this.bag = [0, 1, 2, 3, 4, 5, 6];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop()!;
  }

  private spawn(fromHold?: number) {
    this.applyGarbage();
    if (!this.alive) return;

    let type: number;
    if (fromHold !== undefined) type = fromHold;
    else {
      type = this.cfg.hate ? this.worstPiece() : this.queue.shift()!;
      if (!this.cfg.hate) this.fillQueue();
      this.stats[type]++;
      this.holdUsed = false;
      if (type === I) this.drought = 0;
      else this.maxDrought = Math.max(this.maxDrought, ++this.drought);
    }
    const pos = this.cfg.modern ? SRS_SPAWN(type) : NES_SPAWN;
    this.piece = { type, rot: 0, x: pos.x, y: pos.y };
    this.state = 'play';
    this.gravCounter = 0;
    this.gravAcc = 0;
    this.softCounter = 0;
    this.downArmed = false;
    this.pushdown = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = pos.y;
    this.lastRotate = false;
    if (this.collides(this.piece)) this.die();
  }

  cells(p: Piece) {
    return this.pieces[p.type][p.rot].map(([dx, dy]) => [p.x + dx, p.y + dy] as const);
  }

  collides(p: Piece, board = this.board) {
    for (const [x, y] of this.cells(p)) {
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true;
    }
    return false;
  }

  private tryMove(dx: number, dy: number) {
    const p = this.piece!;
    const moved = { ...p, x: p.x + dx, y: p.y + dy };
    if (this.collides(moved)) return false;
    this.piece = moved;
    this.lastRotate = false;
    return true;
  }

  private tryRotate(dir: number) {
    const p = this.piece!;
    const n = this.pieces[p.type].length;
    if (n === 1) return false;
    const rot = (p.rot + dir + n) % n;
    const kicks = this.cfg.modern ? srsKicks(p.type, p.rot, rot) : [[0, 0] as const];
    for (let i = 0; i < kicks.length; i++) {
      // Kick tables use y-up; the board uses y-down.
      const moved = { ...p, rot, x: p.x + kicks[i][0], y: p.y - kicks[i][1] };
      if (!this.collides(moved)) {
        this.piece = moved;
        this.lastRotate = true;
        this.lastKick = i;
        sfx.rotate();
        return true;
      }
    }
    return false;
  }

  /** Row the current piece would land on (for the ghost). */
  dropY(p = this.piece!) {
    let y = p.y;
    while (!this.collides({ ...p, y: y + 1 })) y++;
    return y;
  }

  // ---------- classic (NES) rules ----------

  private stepClassic({ held, pressed }: PInput) {
    const left = held.has('left');
    const right = held.has('right');

    if (pressed.has('left') || pressed.has('right')) {
      this.das = 0;
      if (this.tryMove(pressed.has('right') ? 1 : -1, 0)) sfx.move();
    } else if (left !== right) {
      if (++this.das >= NES_DAS) {
        if (this.tryMove(right ? 1 : -1, 0)) {
          this.das = NES_DAS - NES_ARR;
          sfx.move();
        } else this.das = NES_DAS;
      }
    }

    if (pressed.has('cw')) this.tryRotate(1);
    if (pressed.has('ccw')) this.tryRotate(-1);

    // Soft drop must be pressed fresh for each piece and is ignored while shifting.
    if (pressed.has('down')) {
      this.downArmed = true;
      this.softCounter = 1;
    }
    if (!held.has('down')) this.downArmed = false;

    if (this.downArmed && !left && !right) {
      this.gravCounter = 0;
      if (++this.softCounter >= 2) {
        this.softCounter = 0;
        if (this.tryMove(0, 1)) this.pushdown++;
        else this.lock();
      }
    } else if (++this.gravCounter >= (NES_GRAVITY[this.level] ?? 1)) {
      this.gravCounter = 0;
      if (!this.tryMove(0, 1)) this.lock();
    }
  }

  // ---------- modern (guideline-style) rules ----------

  private gravityPerFrame() {
    if (this.cfg.twentyG) return 20;
    const l = Math.min(this.level, 29);
    const secondsPerRow = Math.pow(Math.max(0.05, 0.8 - l * 0.007), l);
    return Math.min(20, 1 / (secondsPerRow * 60));
  }

  private stepModern({ held, pressed }: PInput) {
    if (pressed.has('hold') && !this.holdUsed) {
      const current = this.piece!.type;
      const swap = this.hold;
      this.hold = current;
      sfx.hold();
      this.spawn(swap ?? undefined);
      this.holdUsed = true;
      return;
    }

    if (pressed.has('cw') && this.tryRotate(1)) this.onMoved();
    if (pressed.has('ccw') && this.tryRotate(-1)) this.onMoved();

    const left = held.has('left');
    const right = held.has('right');
    if (pressed.has('left') || pressed.has('right')) {
      this.das = 0;
      if (this.tryMove(pressed.has('right') ? 1 : -1, 0)) {
        sfx.move();
        this.onMoved();
      }
    } else if (left !== right) {
      this.das = Math.min(this.das + 1, MODERN_DAS + MODERN_ARR);
      if (this.das >= MODERN_DAS + MODERN_ARR) {
        this.das = MODERN_DAS;
        if (this.tryMove(right ? 1 : -1, 0)) {
          sfx.move();
          this.onMoved();
        }
      }
    }

    if (pressed.has('hard')) {
      const p = this.piece!;
      const y = this.dropY();
      this.score += 2 * (y - p.y);
      if (y > p.y) this.lastRotate = false;
      this.piece = { ...p, y };
      sfx.hardDrop();
      return this.lock();
    }

    const soft = held.has('down');
    const g = soft ? Math.max(this.gravityPerFrame(), 0.5) : this.gravityPerFrame();
    this.gravAcc += g;
    while (this.gravAcc >= 1) {
      this.gravAcc -= 1;
      if (!this.tryMove(0, 1)) {
        this.gravAcc = 0;
        break;
      }
      if (soft) this.score++;
    }

    const p = this.piece!;
    if (p.y > this.lowestY) {
      this.lowestY = p.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
    if (this.collides({ ...p, y: p.y + 1 })) {
      if (++this.lockTimer >= LOCK_DELAY) this.lock();
    } else this.lockTimer = 0;
  }

  /** Move reset for lock delay, limited so pieces can't stall forever. */
  private onMoved() {
    if (this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private detectTSpin(): TSpin {
    const p = this.piece!;
    if (!this.cfg.modern || p.type !== T || !this.lastRotate) return 'none';
    const filled = (x: number, y: number) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && !!this.board[y][x]);
    const c = [
      filled(p.x, p.y), // top-left
      filled(p.x + 2, p.y), // top-right
      filled(p.x + 2, p.y + 2), // bottom-right
      filled(p.x, p.y + 2), // bottom-left
    ];
    if (c.filter(Boolean).length < 3) return 'none';
    // The two corners on the side the T points to.
    const front = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ][p.rot];
    return (c[front[0]] && c[front[1]]) || this.lastKick === 4 ? 'full' : 'mini';
  }

  // ---------- locking & clearing ----------

  private lock() {
    const p = this.piece!;
    const tspin = this.detectTSpin();
    let toppedOut = false;
    for (const [x, y] of this.cells(p)) {
      if (y < 0) toppedOut = true;
      else this.board[y][x] = p.type + 1;
    }
    this.piece = null;
    this.piecesPlaced++;
    this.score += this.pushdown;
    sfx.lock();
    if (toppedOut) return this.die();

    this.clearRows = this.board.flatMap((row, y) => (row.every(Boolean) ? [y] : []));
    const n = this.clearRows.length;
    this.scoreClear(n, tspin);

    this.areDelay = this.cfg.modern
      ? MODERN_ARE
      : 10 + 2 * Math.min(4, Math.max(0, Math.floor((ROWS + 1 - p.y) / 4)));
    this.timer = 0;
    if (n) {
      this.state = 'clear';
    } else {
      this.state = 'are';
      this.timer = this.areDelay;
    }
  }

  private scoreClear(n: number, tspin: TSpin) {
    const mult = this.level + 1;
    const perfect = n > 0 && this.board.every((row) => row.every(Boolean) || row.every((v) => !v));
    let b2bBonus = false;

    if (!this.cfg.modern) {
      this.score += NES_LINE_SCORE[n] * mult;
    } else {
      const base =
        tspin === 'full' ? [400, 800, 1200, 1600][n] : tspin === 'mini' ? [100, 200, 400, 400][n] : [0, 100, 300, 500, 800][n];
      const difficult = n === 4 || (tspin !== 'none' && n > 0);
      b2bBonus = difficult && this.b2b;
      this.score += Math.floor(base * mult * (b2bBonus ? 1.5 : 1));
      if (n > 0) this.b2b = difficult;
      this.combo = n > 0 ? this.combo + 1 : -1;
      if (this.combo > 0) this.score += 50 * this.combo * mult;
      if (perfect) this.score += [0, 800, 1200, 1800, 2000][n] * mult;
    }
    this.score = Math.min(9999999, this.score);
    if (n === 4) this.tetrisLines += 4;

    // Feedback
    if (tspin !== 'none') {
      sfx.tspin();
      const kind = ['', ' SINGLE', ' DOUBLE', ' TRIPLE'][n] ?? '';
      this.popup(tspin === 'mini' ? 'MINI T-SPIN' : `T-SPIN${kind}`, '#b44cff');
    }
    if (n === 4) sfx.tetris();
    else if (n > 0 && tspin === 'none') sfx.clear();
    if (n === 4) this.popup('TETRIS', '#3ee8f0');
    if (b2bBonus) this.popup('BACK-TO-BACK', '#ffd83a');
    if (this.cfg.modern && this.combo > 0) this.popup(`COMBO ${this.combo}`, '#ff9a2e');
    if (perfect) this.popup('PERFECT CLEAR', '#3fe05a');

    if (n > 0) {
      const cells = this.clearRows.flatMap((y) => this.board[y].map((v, x) => ({ x, y, type: v - 1 })));
      this.events.push({ lines: n, tspin, b2b: b2bBonus, combo: this.combo, perfect, cells });
    }
  }

  popup(text: string, color: string) {
    this.popups.push({ text, color, timer: 90 });
    if (this.popups.length > 4) this.popups.shift();
  }

  // Cells vanish from the center outward.
  private stepClear() {
    const every = this.cfg.modern ? 2 : 4;
    this.timer++;
    if (this.timer % every === 0 && this.timer <= every * 5) {
      const k = this.timer / every - 1;
      for (const y of this.clearRows) this.board[y][4 - k] = this.board[y][5 + k] = 0;
    }
    if (this.timer < every * 5 + 2) return;

    const n = this.clearRows.length;
    this.board = this.board.filter((_, y) => !this.clearRows.includes(y));
    while (this.board.length < ROWS) this.board.unshift(new Array(COLS).fill(0));
    this.lines += n;
    const lvl = this.levelForLines();
    if (lvl > this.level) {
      this.level = lvl;
      sfx.level();
    }
    this.clearRows = [];
    this.state = 'are';
    this.timer = this.areDelay;
  }

  private levelForLines() {
    if (this.cfg.fixedLevel) return this.level;
    const s = this.cfg.startLevel;
    if (this.cfg.modern) return s + Math.floor(this.lines / 10);
    const first = Math.min(s * 10 + 10, Math.max(100, s * 10 - 50));
    if (this.lines < first) return s;
    return s + 1 + Math.floor((this.lines - first) / 10);
  }

  die() {
    this.state = 'dead';
  }

  // ---------- garbage ----------

  private fillGarbage(height: number) {
    // B-Type: random blocks, never a full row.
    for (let y = ROWS - height; y < ROWS; y++) {
      const row = this.board[y];
      for (let x = 0; x < COLS; x++) if (this.garbageRng() < 0.55) row[x] = 1 + Math.floor(this.garbageRng() * 7);
      if (row.every(Boolean)) row[Math.floor(this.garbageRng() * COLS)] = 0;
      if (row.every((v) => !v)) row[Math.floor(this.garbageRng() * COLS)] = 1 + Math.floor(this.garbageRng() * 7);
    }
  }

  /** Versus: lines queued by the opponent rise when this player's next piece spawns. */
  private applyGarbage() {
    if (!this.garbage) return;
    const n = Math.min(this.garbage, ROWS);
    this.garbage = 0;
    const hole = Math.floor(this.garbageRng() * COLS);
    const pushedOut = this.board.slice(0, n).some((row) => row.some(Boolean));
    this.board = this.board.slice(n);
    for (let i = 0; i < n; i++) this.board.push(Array.from({ length: COLS }, (_, x) => (x === hole ? 0 : 8)));
    sfx.garbage();
    if (pushedOut) this.die();
  }

  // ---------- HATE mode ----------

  /** The piece whose best placement leaves the player worst off. */
  private worstPiece() {
    const order = [4, 2, 3, 6, 5, 1, 0]; // ties favour S and Z
    let worst = order[0];
    let worstValue = -Infinity;
    for (const type of order) {
      const best = this.bestPlacementValue(type);
      if (best > worstValue) {
        worstValue = best;
        worst = type;
      }
    }
    return worst;
  }

  /** Lower is better for the player: stack height after the best drop, then holes. */
  private bestPlacementValue(type: number) {
    let best = Infinity;
    for (let rot = 0; rot < this.pieces[type].length; rot++) {
      for (let x = -3; x < COLS + 3; x++) {
        const p = { type, rot, x, y: -2 };
        if (this.collides(p)) continue;
        p.y = this.dropY(p);
        const b = this.board.map((row) => row.slice());
        let dead = false;
        for (const [cx, cy] of this.cells(p)) {
          if (cy < 0) dead = true;
          else b[cy][cx] = 1;
        }
        if (dead) continue;
        const kept = b.filter((row) => !row.every(Boolean));
        const cleared = ROWS - kept.length;
        const board = [...Array.from({ length: cleared }, () => new Array(COLS).fill(0)), ...kept];
        const top = board.findIndex((row) => row.some(Boolean));
        const height = top < 0 ? 0 : ROWS - top;
        let holes = 0;
        for (let cx = 0; cx < COLS; cx++) {
          let seen = false;
          for (let cy = 0; cy < ROWS; cy++) {
            if (board[cy][cx]) seen = true;
            else if (seen) holes++;
          }
        }
        best = Math.min(best, height * 100 + holes);
      }
    }
    return best;
  }
}

function emptyBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}
