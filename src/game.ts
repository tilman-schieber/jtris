import { PIECES } from './pieces';
import { sfx, music } from './audio';

export const COLS = 10;
export const ROWS = 20;

// NES frames-per-cell gravity table (levels 0-28, 29+ = 1).
const GRAVITY = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
const LINE_SCORE = [0, 40, 100, 300, 1200];
const DAS_DELAY = 16;
const DAS_REPEAT = 6;

export type Action = 'left' | 'right' | 'up' | 'down' | 'rotCW' | 'rotCCW' | 'start' | 'mute' | 'colors' | 'scores';
export type ColorMode = 'classic' | 'modern';
export type Phase = 'title' | 'play' | 'clear' | 'are' | 'curtain' | 'over' | 'entry' | 'scores';

export interface Input {
  held: Set<Action>;
  pressed: Set<Action>;
  typed: string[]; // raw A-Z / 0-9 / Backspace / Enter, for name entry
}

export interface ScoreEntry {
  name: string;
  score: number;
  lines: number;
  level: number;
}

export const MAX_SCORES = 10;
export const NAME_LEN = 6;
const NAME_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export interface Piece {
  type: number;
  rot: number;
  x: number;
  y: number;
}

const loadColors = (): ColorMode => {
  try {
    return localStorage.getItem('jtris.colors') === 'modern' ? 'modern' : 'classic';
  } catch {
    return 'classic';
  }
};

const isEntry = (e: unknown): e is ScoreEntry =>
  !!e && typeof (e as ScoreEntry).name === 'string' && Number.isFinite((e as ScoreEntry).score);

function loadScores(): ScoreEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem('jtris.scores') ?? '[]');
    const scores: ScoreEntry[] = Array.isArray(raw) ? raw.filter(isEntry) : [];
    // Carry over the single top score from earlier versions.
    const oldTop = Number(localStorage.getItem('jtris.top'));
    if (!scores.length && oldTop > 0) scores.push({ name: '------', score: oldTop, lines: 0, level: 0 });
    return scores.sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
  } catch {
    return [];
  }
}

function load(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export class Game {
  phase: Phase = 'title';
  paused = false;
  board: number[][] = emptyBoard();
  piece: Piece | null = null;
  next = 0;
  startLevel = 0;
  level = 0;
  lines = 0;
  score = 0;
  scores = loadScores();
  colors = loadColors();
  /** Row of the table being named or just added; -1 if none. */
  entryRank = -1;
  entryName: string[] = [];
  entryCursor = 0;
  /** Name is still the prefilled suggestion; typing replaces it. */
  private entryFresh = false;
  stats = new Array(7).fill(0);
  clearRows: number[] = [];
  timer = 0;
  curtainRow = 0;

  private das = 0;
  private gravCounter = 0;
  private softCounter = 0;
  private downArmed = false;
  private pushdown = 0;
  private areDelay = 10;
  private lastRoll = -1;

  get top() {
    return this.scores[0]?.score ?? 0;
  }

  step(input: Input) {
    const { pressed } = input;
    // Letter keys are for typing while entering a name.
    if (this.phase === 'entry') return this.stepEntry(input);
    if (pressed.has('mute')) music.toggle();
    if (pressed.has('colors')) this.toggleColors();

    switch (this.phase) {
      case 'title':
        return this.stepTitle(pressed);
      case 'curtain':
        if (++this.timer % 3 === 0) this.curtainRow++;
        if (this.curtainRow > ROWS + 6) {
          if (this.entryRank >= 0) this.phase = 'entry';
          else this.phase = 'over';
        }
        return;
      case 'over':
        if (pressed.has('start')) {
          this.phase = 'scores';
          sfx.select();
        }
        return;
      case 'scores':
        if (pressed.has('start') || pressed.has('scores')) {
          this.phase = 'title';
          this.entryRank = -1;
          sfx.select();
        }
        return;
    }

    if (pressed.has('start')) {
      this.paused = !this.paused;
      sfx.pause();
      if (this.paused) music.halt();
      else music.play();
      return;
    }
    if (this.paused) return;

    if (this.phase === 'play') this.stepPlay(input);
    else {
      // DAS keeps charging between pieces, like on the NES.
      if (input.held.has('left') !== input.held.has('right')) this.das = Math.min(DAS_DELAY, this.das + 1);
      if (this.phase === 'clear') this.stepClear();
      else if (--this.timer <= 0) {
        this.phase = 'play';
        this.spawn();
      }
    }
  }

  private toggleColors() {
    this.colors = this.colors === 'classic' ? 'modern' : 'classic';
    sfx.select();
    save('jtris.colors', this.colors);
  }

  private stepEntry({ pressed, typed }: Input) {
    const name = this.entryName;
    const cycle = (d: number) => {
      const i = NAME_CHARS.indexOf(name[this.entryCursor]);
      name[this.entryCursor] = NAME_CHARS[(i + d + NAME_CHARS.length) % NAME_CHARS.length];
      sfx.move();
    };
    if (pressed.has('up')) cycle(1);
    if (pressed.has('down')) cycle(-1);
    if (pressed.has('left') && this.entryCursor > 0) this.entryCursor--;
    if (pressed.has('right') && this.entryCursor < NAME_LEN - 1) this.entryCursor++;

    for (const key of typed) {
      if (key === 'Enter') return this.commitName();
      if (key === 'Backspace') {
        if (name[this.entryCursor] === ' ' && this.entryCursor > 0) this.entryCursor--;
        name[this.entryCursor] = ' ';
      } else {
        if (this.entryFresh) {
          name.fill(' ');
          this.entryCursor = 0;
        }
        name[this.entryCursor] = key;
        this.entryCursor = Math.min(NAME_LEN - 1, this.entryCursor + 1);
      }
      this.entryFresh = false;
      sfx.move();
    }
    if (pressed.size) this.entryFresh = false;
  }

  private commitName() {
    const name = this.entryName.join('').trim() || '------';
    this.scores[this.entryRank].name = name;
    save('jtris.scores', JSON.stringify(this.scores));
    save('jtris.name', name);
    this.phase = 'scores';
    sfx.level();
  }

  private stepTitle(pressed: Set<Action>) {
    const before = this.startLevel;
    if (pressed.has('left') && this.startLevel % 5 > 0) this.startLevel--;
    if (pressed.has('right') && this.startLevel % 5 < 4) this.startLevel++;
    if (pressed.has('up') && this.startLevel >= 5) this.startLevel -= 5;
    if (pressed.has('down') && this.startLevel < 5) this.startLevel += 5;
    if (before !== this.startLevel) sfx.select();
    if (pressed.has('scores')) {
      this.phase = 'scores';
      this.entryRank = -1;
      sfx.select();
      return;
    }

    if (pressed.has('start') || pressed.has('rotCW')) this.newGame();
  }

  private newGame() {
    this.board = emptyBoard();
    this.level = this.startLevel;
    this.lines = 0;
    this.score = 0;
    this.stats.fill(0);
    this.paused = false;
    this.das = 0;
    this.lastRoll = -1;
    this.next = this.roll();
    this.phase = 'play';
    sfx.start();
    music.play(true);
    this.spawn();
  }

  // NES randomizer: roll 0-7; on 7 or a repeat, reroll once over 0-6.
  private roll() {
    let r = Math.floor(Math.random() * 8);
    if (r === 7 || r === this.lastRoll) r = Math.floor(Math.random() * 7);
    this.lastRoll = r;
    return r;
  }

  private spawn() {
    this.piece = { type: this.next, rot: 0, x: 5, y: 0 };
    this.next = this.roll();
    this.stats[this.piece.type]++;
    this.gravCounter = 0;
    this.softCounter = 0;
    this.downArmed = false;
    this.pushdown = 0;
    if (this.collides(this.piece)) this.gameOver();
  }

  collides(p: Piece) {
    for (const [dx, dy] of PIECES[p.type][p.rot]) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && this.board[y][x]) return true;
    }
    return false;
  }

  private tryMove(dx: number, dy: number, drot = 0) {
    const p = this.piece!;
    const n = PIECES[p.type].length;
    const moved = { ...p, x: p.x + dx, y: p.y + dy, rot: (p.rot + drot + n) % n };
    if (this.collides(moved)) return false;
    this.piece = moved;
    return true;
  }

  private stepPlay({ held, pressed }: Input) {
    const left = held.has('left');
    const right = held.has('right');

    // Horizontal movement with NES delayed auto shift.
    if (pressed.has('left') || pressed.has('right')) {
      this.das = 0;
      if (this.tryMove(pressed.has('right') ? 1 : -1, 0)) sfx.move();
    } else if (left !== right) {
      if (++this.das >= DAS_DELAY) {
        if (this.tryMove(right ? 1 : -1, 0)) {
          this.das = DAS_DELAY - DAS_REPEAT;
          sfx.move();
        } else this.das = DAS_DELAY;
      }
    }

    // Rotation (no wall kicks, just like the original).
    if (PIECES[this.piece!.type].length > 1) {
      if ((pressed.has('rotCW') || pressed.has('up')) && this.tryMove(0, 0, 1)) sfx.rotate();
      if (pressed.has('rotCCW') && this.tryMove(0, 0, -1)) sfx.rotate();
    }

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
    } else if (++this.gravCounter >= (GRAVITY[this.level] ?? 1)) {
      this.gravCounter = 0;
      if (!this.tryMove(0, 1)) this.lock();
    }
  }

  private lock() {
    const p = this.piece!;
    let toppedOut = false;
    for (const [dx, dy] of PIECES[p.type][p.rot]) {
      const y = p.y + dy;
      if (y < 0) toppedOut = true;
      else this.board[y][p.x + dx] = p.type + 1;
    }
    this.piece = null;
    this.score = Math.min(999999, this.score + this.pushdown);
    sfx.lock();
    if (toppedOut) return this.gameOver();

    // Entry delay grows the higher the piece locked.
    this.areDelay = 10 + 2 * Math.min(4, Math.max(0, Math.floor((ROWS + 1 - p.y) / 4)));
    this.clearRows = this.board.flatMap((row, y) => (row.every(Boolean) ? [y] : []));
    this.timer = 0;
    if (this.clearRows.length) {
      this.phase = 'clear';
      if (this.clearRows.length === 4) sfx.tetris();
      else sfx.clear();
    } else {
      this.phase = 'are';
      this.timer = this.areDelay;
    }
  }

  // Cells vanish from the center outward, two columns every 4 frames.
  private stepClear() {
    this.timer++;
    if (this.timer % 4 === 0 && this.timer <= 20) {
      const k = this.timer / 4 - 1;
      for (const y of this.clearRows) this.board[y][4 - k] = this.board[y][5 + k] = 0;
    }
    if (this.timer < 22) return;

    const n = this.clearRows.length;
    this.board = this.board.filter((_, y) => !this.clearRows.includes(y));
    while (this.board.length < ROWS) this.board.unshift(new Array(COLS).fill(0));
    this.lines = Math.min(9999, this.lines + n);
    this.score = Math.min(999999, this.score + LINE_SCORE[n] * (this.level + 1));
    const lvl = this.levelForLines();
    if (lvl > this.level) {
      this.level = lvl;
      sfx.level();
    }
    this.clearRows = [];
    this.phase = 'are';
    this.timer = this.areDelay;
  }

  private levelForLines() {
    const s = this.startLevel;
    const first = Math.min(s * 10 + 10, Math.max(100, s * 10 - 50));
    if (this.lines < first) return s;
    return s + 1 + Math.floor((this.lines - first) / 10);
  }

  private gameOver() {
    this.phase = 'curtain';
    this.timer = 0;
    this.curtainRow = 0;
    music.stop();
    sfx.over();

    // Made the table? Insert a placeholder row to name after the curtain falls.
    this.entryRank = -1;
    const rank = this.scores.findIndex((e) => this.score > e.score);
    const at = rank >= 0 ? rank : this.scores.length;
    if (this.score > 0 && at < MAX_SCORES) {
      this.scores.splice(at, 0, { name: '', score: this.score, lines: this.lines, level: this.level });
      this.scores.length = Math.min(this.scores.length, MAX_SCORES);
      this.entryRank = at;
      const last = (load('jtris.name') ?? '').slice(0, NAME_LEN);
      this.entryName = last.padEnd(NAME_LEN, ' ').split('');
      this.entryCursor = Math.min(NAME_LEN - 1, last.length);
      this.entryFresh = last.length > 0;
    }
  }
}

function emptyBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}
