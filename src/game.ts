import { Player, PInput, ClearEvent } from './player';
import { MODES, Mode, B_HEIGHTS, ROLL_FRAMES } from './modes';
import { loadTables, saveTables, rankFor, ScoreEntry, Tables, MAX_SCORES, load, save } from './scores';
import { sfx, music, ACCELERATES, TRACK_NAMES } from './audio';
import { hashString, randomSeed, today } from './rng';
import { blockColor, MODERN_COLORS } from './draw';
import { HELP_PAGES } from './help';

export type GAction = 'up' | 'down' | 'left' | 'right' | 'start' | 'back' | 'quit' | 'mute' | 'colors' | 'scores';

export interface Input {
  held: Set<GAction>;
  pressed: Set<GAction>;
  players: [PInput, PInput];
  /** Raw A-Z / 0-9 / Backspace / Enter, for name entry. */
  typed: string[];
}

export type Phase =
  | 'title'
  | 'ready'
  | 'play'
  | 'curtain'
  | 'over'
  | 'ending'
  | 'result'
  | 'entry'
  | 'scores'
  | 'vsresult'
  | 'help';

export type ColorMode = 'classic' | 'modern';

export interface Settings {
  mode: number;
  level: number;
  height: number;
  modern: boolean;
  colors: ColorMode;
  music: number;
  daily: boolean;
}

export const MENU = ['MODE', 'LEVEL', 'HEIGHT', 'RULES', 'COLORS', 'MUSIC', 'SEED', 'HELP'] as const;
export const NAME_LEN = 6;
const NAME_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export interface Particle {
  /** Player field index, or -1 for screen coordinates. */
  field: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export interface Result {
  title: string;
  rows: [string, string][];
}

const DEFAULT_SETTINGS: Settings = { mode: 0, level: 0, height: 0, modern: false, colors: 'classic', music: 0, daily: false };

function loadSettings(): Settings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(load('jtris.settings') ?? '{}') };
    // Colors used to be stored on their own.
    if (load('jtris.colors') === 'modern' && !load('jtris.settings')) s.colors = 'modern';
    s.mode = Math.min(MODES.length - 1, Math.max(0, s.mode | 0));
    s.level = Math.min(29, Math.max(0, s.level | 0));
    s.height = Math.min(B_HEIGHTS.length - 1, Math.max(0, s.height | 0));
    s.music = Math.min(TRACK_NAMES.length - 1, Math.max(0, s.music | 0));
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export class Game {
  phase: Phase = 'title';
  settings = loadSettings();
  menuRow = 0;
  players: Player[] = [];
  paused = false;
  /** Frames since play began. */
  frames = 0;
  timer = 0;
  curtainRow = 0;
  /** Frames left in 20G mode's invisible roll; -1 before it starts. */
  rollTimer = -1;
  goFlash = 0;

  tables: Tables = loadTables();
  scoresView = 0;
  entryRank = -1;
  entryName: string[] = [];
  entryCursor = 0;
  private entryFresh = false;

  result: Result = { title: '', rows: [] };
  wins = [0, 0];
  winner = -1;
  endingTier = 0;

  shake = 0;
  helpPage = 0;
  particles: Particle[] = [];

  get mode(): Mode {
    return MODES[this.settings.mode];
  }

  get versus() {
    return this.mode.id === 'versus' && this.players.length === 2;
  }

  get modern() {
    return this.mode.forceModern || this.settings.modern;
  }

  get colors(): ColorMode {
    return this.settings.colors;
  }

  /** Best entry for the selected mode. */
  best(modeIdx = this.settings.mode): ScoreEntry | undefined {
    return this.tables[MODES[modeIdx].id]?.[0];
  }

  step(input: Input) {
    const { pressed } = input;
    this.stepEffects();
    // Letter keys are for typing while entering a name.
    if (this.phase === 'entry') return this.stepEntry(input);
    if (pressed.has('mute')) music.toggle();
    if (pressed.has('colors')) this.toggleColors();

    switch (this.phase) {
      case 'title':
        return this.stepTitle(pressed);
      case 'ready':
        if (this.timer === 0) sfx.ready();
        if (++this.timer >= 60) this.begin();
        return;
      case 'play':
        return this.stepPlay(input);
      case 'curtain':
        if (++this.timer % 3 === 0) this.curtainRow++;
        if (this.curtainRow > 26) this.phase = this.entryRank >= 0 ? 'entry' : 'over';
        return;
      case 'over':
        if (pressed.has('start')) this.showScores();
        return;
      case 'ending':
        this.stepEnding();
        if (++this.timer > 520 || (this.timer > 60 && pressed.has('start'))) {
          this.phase = 'result';
          this.timer = 0;
        }
        return;
      case 'result':
        if (++this.timer > 30 && pressed.has('start')) {
          if (this.entryRank >= 0) this.phase = 'entry';
          else this.showScores();
          sfx.select();
        }
        return;
      case 'scores':
        return this.stepScores(pressed);
      case 'vsresult':
        if (++this.timer > 30 && pressed.has('start')) this.startGame();
        else if (pressed.has('back') || pressed.has('quit')) this.toTitle();
        return;
      case 'help':
        return this.stepHelp(pressed);
    }
  }

  // ---------- menu ----------

  private saveSettings() {
    save('jtris.settings', JSON.stringify(this.settings));
  }

  private toggleColors() {
    this.settings.colors = this.settings.colors === 'classic' ? 'modern' : 'classic';
    sfx.select();
    this.saveSettings();
  }

  /** Whether a menu row applies to the selected mode. */
  rowEnabled(row: (typeof MENU)[number]) {
    if (row === 'LEVEL') return this.mode.usesLevel;
    if (row === 'HEIGHT') return this.mode.usesHeight;
    if (row === 'RULES') return !this.mode.forceModern;
    if (row === 'SEED') return this.mode.id !== 'hate';
    return true;
  }

  private stepTitle(pressed: Set<string>) {
    const s = this.settings;
    // Preview the selected tune on the title screen.
    if (!music.running && s.music < 3) music.play(s.music);

    if (pressed.has('up')) this.menuRow = (this.menuRow + MENU.length - 1) % MENU.length;
    if (pressed.has('down')) this.menuRow = (this.menuRow + 1) % MENU.length;
    if (pressed.has('up') || pressed.has('down')) sfx.move();

    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    const row = MENU[this.menuRow];
    // The HELP row opens the guide on the selected mode's page.
    if (row === 'HELP' && (d || pressed.has('start'))) {
      this.helpPage = s.mode;
      this.phase = 'help';
      sfx.select();
      return;
    }
    if (d && this.rowEnabled(row)) {
      const wrap = (v: number, n: number) => (v + d + n) % n;
      if (row === 'MODE') s.mode = wrap(s.mode, MODES.length);
      if (row === 'LEVEL') s.level = wrap(s.level, 30);
      if (row === 'HEIGHT') s.height = wrap(s.height, B_HEIGHTS.length);
      if (row === 'RULES') s.modern = !s.modern;
      if (row === 'COLORS') s.colors = s.colors === 'classic' ? 'modern' : 'classic';
      if (row === 'SEED') s.daily = !s.daily;
      if (row === 'MUSIC') {
        s.music = wrap(s.music, TRACK_NAMES.length);
        music.play(s.music, true);
      }
      sfx.select();
      this.saveSettings();
    }

    if (pressed.has('scores')) {
      this.scoresView = this.mode.id === 'versus' ? 0 : s.mode;
      this.entryRank = -1;
      this.phase = 'scores';
      sfx.select();
    } else if (pressed.has('start')) {
      this.wins = [0, 0];
      this.startGame();
    }
  }

  private stepHelp(pressed: Set<string>) {
    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    if (d) {
      this.helpPage = (this.helpPage + d + HELP_PAGES.length) % HELP_PAGES.length;
      sfx.move();
    }
    if (pressed.has('start') || pressed.has('back') || pressed.has('quit')) {
      this.phase = 'title';
      sfx.select();
    }
  }

  // ---------- starting & playing ----------

  startGame() {
    const mode = this.mode;
    const s = this.settings;
    const seed = s.daily && mode.id !== 'hate' ? hashString(`${today()}:${mode.id}`) : randomSeed();
    const cfg = {
      modern: this.modern,
      startLevel: mode.usesLevel ? s.level : 0,
      seed,
      garbageHeight: mode.id === 'b' ? B_HEIGHTS[s.height] : 0,
      fixedLevel: mode.id === 'b',
      twentyG: mode.id === 'master',
      hate: mode.id === 'hate',
    };
    // Versus players share a seed so both get the same pieces.
    this.players = mode.id === 'versus' ? [new Player(cfg), new Player(cfg)] : [new Player(cfg)];
    this.frames = 0;
    this.paused = false;
    this.rollTimer = -1;
    this.entryRank = -1;
    this.particles = [];
    this.shake = 0;
    this.winner = -1;
    this.timer = 0;
    music.play(s.music, true);
    music.setSpeed(1);
    if (mode.countdown) this.phase = 'ready';
    else {
      sfx.start();
      this.begin();
    }
  }

  private begin() {
    for (const p of this.players) p.start();
    this.phase = 'play';
    if (this.mode.countdown) {
      this.goFlash = 40;
      sfx.go();
    }
  }

  private stepPlay(input: Input) {
    const { pressed } = input;
    if (pressed.has('start') || pressed.has('back')) {
      this.paused = !this.paused;
      sfx.pause();
      if (this.paused) music.halt();
      else music.resume();
      return;
    }
    if (this.paused) {
      if (pressed.has('quit')) this.toTitle();
      return;
    }
    if (this.goFlash > 0) this.goFlash--;

    this.players.forEach((p, i) => p.step(input.players[i]));
    this.frames++;

    this.players.forEach((p, i) => {
      for (const e of p.events) this.onClear(i, e);
      p.events = [];
    });

    const p = this.players[0];
    if (ACCELERATES[this.settings.music]) music.setSpeed(1 + Math.min(0.9, p.level * 0.05));

    if (this.versus) return this.checkVersus();

    const mode = this.mode;
    if (!p.alive) return this.gameOver();
    if (mode.timeLimit && this.frames >= mode.timeLimit) return this.finish('result', 'TIME UP!');
    if (mode.id === 'sprint' && p.lines >= mode.goal!) return this.finish('result', 'COMPLETE!');
    if (mode.id === 'b' && p.lines >= mode.goal!) return this.finish('ending', 'B-TYPE CLEAR!');
    if (mode.id === 'master') {
      if (this.rollTimer < 0 && p.lines >= mode.goal!) {
        this.rollTimer = ROLL_FRAMES;
        p.invisible = true;
        p.popup('ROLL START', '#fcfcfc');
        sfx.level();
      } else if (this.rollTimer > 0 && --this.rollTimer === 0) {
        return this.finish('ending', 'GRAND MASTER!');
      }
    }
  }

  private onClear(i: number, e: ClearEvent) {
    const p = this.players[i];
    const modern = this.colors === 'modern';
    for (const c of e.cells) {
      for (let k = 0; k < 2; k++) {
        this.particles.push({
          field: i,
          x: c.x * 8 + 4,
          y: c.y * 8 + 4,
          vx: (Math.random() - 0.5) * 3,
          vy: -Math.random() * 2.5 - 0.5,
          gravity: 0.15,
          life: 30 + Math.random() * 20,
          max: 50,
          color: blockColor(c.type, p.level, modern),
          size: 2,
        });
      }
    }
    if (e.lines === 4 || e.tspin === 'full' || e.perfect) this.shake = 12;

    if (this.versus) {
      let attack = e.tspin === 'full' ? e.lines * 2 : e.lines === 4 ? 4 : [0, 0, 1, 2][e.lines];
      if (e.b2b) attack++;
      if (e.combo > 1) attack += Math.floor(e.combo / 2);
      if (e.perfect) attack += 4;
      // Clearing lines first cancels garbage headed your way.
      const cancel = Math.min(attack, p.garbage);
      p.garbage -= cancel;
      attack -= cancel;
      if (attack > 0) this.players[1 - i].garbage += attack;
    }
  }

  private checkVersus() {
    const [a, b] = this.players;
    if (a.alive && b.alive) return;
    this.winner = a.alive ? 0 : b.alive ? 1 : -1;
    if (this.winner >= 0) this.wins[this.winner]++;
    this.phase = 'vsresult';
    this.timer = 0;
    music.stop();
    sfx.win();
  }

  private gameOver() {
    this.phase = 'curtain';
    this.timer = 0;
    this.curtainRow = 0;
    music.stop();
    sfx.over();
    // Only modes that don't need a clear to count get a score on top-out.
    if (['a', 'ultra', 'master', 'hate'].includes(this.mode.id)) this.prepareEntry();
    this.buildResult('GAME OVER');
  }

  private finish(next: 'ending' | 'result', title: string) {
    music.stop();
    sfx.win();
    this.prepareEntry();
    this.buildResult(title);
    const p = this.players[0];
    this.endingTier = Math.min(4, Math.floor(p.score / 25000) + (this.mode.id === 'master' ? 2 : this.settings.height >> 1));
    this.phase = next;
    this.timer = 0;
    this.particles = [];
  }

  private buildResult(title: string) {
    const p = this.players[0];
    const rows: [string, string][] = [];
    const mode = this.mode.id;
    if (mode === 'sprint' || mode === 'ultra' || mode === 'master') rows.push(['TIME', formatClock(this.frames)]);
    rows.push(['SCORE', String(p.score)]);
    rows.push(['LINES', String(p.lines)]);
    rows.push(['PIECES', String(p.piecesPlaced)]);
    if (this.frames > 0) rows.push(['PPS', (p.piecesPlaced / (this.frames / 60)).toFixed(2)]);
    rows.push(['TRT', `${p.tetrisRate}%`]);
    this.result = { title, rows };
  }

  private toTitle() {
    this.phase = 'title';
    this.players = [];
    this.paused = false;
    this.entryRank = -1;
    this.particles = [];
    music.stop();
    sfx.select();
  }

  // ---------- ending (rocket launch) ----------

  private stepEnding() {
    const t = this.timer;
    const rocketY = rocketTop(t);
    const baseY = rocketY + 64;
    if (t > 90 && baseY < 260) {
      for (let k = 0; k < 3; k++) {
        this.particles.push({
          field: -1,
          x: 128 + (Math.random() - 0.5) * 8,
          y: baseY - 2,
          vx: (Math.random() - 0.5) * 0.8,
          vy: 1 + Math.random() * 1.5,
          gravity: 0,
          life: 10 + Math.random() * 8,
          max: 18,
          color: ['#fcfcfc', '#ffd83a', '#ff9a2e', '#f83800'][Math.floor(Math.random() * 4)],
          size: 2,
        });
      }
    }
    // Smoke billows along the ground at lift-off.
    if (t > 100 && t < 260 && t % 2 === 0) {
      for (const dir of [-1, 1]) {
        this.particles.push({
          field: -1,
          x: 128 + dir * 6,
          y: 186 + Math.random() * 4,
          vx: dir * (0.5 + Math.random() * 1.5),
          vy: -Math.random() * 0.3,
          gravity: 0,
          life: 40 + Math.random() * 30,
          max: 70,
          color: ['#bcbcbc', '#7c7c7c', '#fcfcfc'][Math.floor(Math.random() * 3)],
          size: 4,
        });
      }
    }
    // Fireworks, more for a better run.
    const bursts = 2 + this.endingTier * 2;
    for (let i = 0; i < bursts; i++) {
      if (t === 230 + i * Math.floor(240 / bursts)) {
        const x = 40 + Math.random() * 176;
        const y = 30 + Math.random() * 70;
        const color = MODERN_COLORS[Math.floor(Math.random() * MODERN_COLORS.length)];
        for (let k = 0; k < 28; k++) {
          const a = (k / 28) * Math.PI * 2;
          const v = 1 + Math.random() * 0.6;
          this.particles.push({ field: -1, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, gravity: 0.03, life: 50, max: 50, color, size: 2 });
        }
        sfx.clear();
      }
    }
    if (t === 100) sfx.garbage();
    if (t > 100 && t < 180) this.shake = 2;
  }

  private stepEffects() {
    if (this.shake > 0) this.shake--;
    if (!this.particles.length) return;
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life--;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // ---------- high scores ----------

  private prepareEntry() {
    this.entryRank = -1;
    const mode = this.mode;
    const p = this.players[0];
    if (mode.rank === 'none') return;
    if (mode.rank === 'score' && p.score <= 0) return;
    if (mode.rank === 'lines' && p.lines <= 0) return;
    const entry: ScoreEntry = {
      name: '',
      score: p.score,
      lines: p.lines,
      level: p.level,
      time: this.frames,
      rules: p.cfg.modern ? 'M' : 'C',
    };
    const list = this.tables[mode.id];
    const at = rankFor(list, mode.rank, entry);
    this.scoresView = this.settings.mode;
    if (at < 0) return;
    list.splice(at, 0, entry);
    list.length = Math.min(list.length, MAX_SCORES);
    this.entryRank = at;
    const last = (load('jtris.name') ?? '').slice(0, NAME_LEN);
    this.entryName = last.padEnd(NAME_LEN, ' ').split('');
    this.entryCursor = Math.min(NAME_LEN - 1, last.length);
    this.entryFresh = last.length > 0;
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
        // A suggested name is replaced as soon as you type.
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
    this.tables[this.mode.id][this.entryRank].name = name;
    saveTables(this.tables);
    save('jtris.name', name);
    this.phase = 'scores';
    this.timer = 0;
    sfx.level();
  }

  private showScores() {
    this.scoresView = this.mode.id === 'versus' ? 0 : this.settings.mode;
    this.phase = 'scores';
    this.timer = 0;
    sfx.select();
  }

  private stepScores(pressed: Set<string>) {
    const ranked = MODES.map((_, i) => i).filter((i) => MODES[i].rank !== 'none');
    const d = (pressed.has('right') ? 1 : 0) - (pressed.has('left') ? 1 : 0);
    if (d) {
      const at = ranked.indexOf(this.scoresView);
      this.scoresView = ranked[(at + d + ranked.length) % ranked.length];
      this.entryRank = -1;
      sfx.select();
    }
    if (pressed.has('start') || pressed.has('back') || pressed.has('scores')) this.toTitle();
  }
}

/** Top of the rocket sprite during the ending. */
export function rocketTop(t: number) {
  const lift = Math.max(0, t - 170);
  return 124 - 0.012 * lift * lift;
}

export function formatClock(frames: number) {
  const s = Math.floor(frames / 60);
  const cs = Math.floor(((frames % 60) * 100) / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
