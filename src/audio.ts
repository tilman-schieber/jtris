// Tiny Web Audio chiptune synth: SFX + three public-domain tunes in original arrangements.
let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;

export function unlockAudio() {
  // iOS: play through the silent switch like a media app (Safari 16.4+).
  const session = (navigator as { audioSession?: { type: string } }).audioSession;
  if (session && session.type !== 'playback') session.type = 'playback';
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number) {
  if (!ctx) return;
  const t = at || ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function noise(dur: number, vol: number, cutoff: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur);
}

function arp(notes: number[], step: number, vol = 0.25) {
  if (!ctx) return;
  const t = ctx.currentTime;
  notes.forEach((n, i) => n && tone(midiHz(n), step, 'square', vol, t + i * step));
}

export const sfx = {
  move: () => tone(1400, 0.02, 'square', 0.12),
  rotate: () => tone(600, 0.05, 'square', 0.18, 0, 1200),
  lock: () => noise(0.09, 0.5, 900),
  hardDrop: () => {
    noise(0.12, 0.7, 600);
    tone(180, 0.08, 'square', 0.2, 0, 60);
  },
  hold: () => tone(500, 0.06, 'triangle', 0.4, 0, 900),
  select: () => tone(988, 0.04, 'square', 0.18),
  start: () => arp([72, 76, 79, 84], 0.05),
  pause: () => arp([84, 79], 0.06, 0.18),
  clear: () => arp([79, 83, 86, 91], 0.045),
  tetris: () => arp([72, 76, 79, 84, 88, 91, 96, 91, 96], 0.05),
  tspin: () => arp([67, 74, 79, 86], 0.04, 0.22),
  level: () => arp([84, 88, 91, 96], 0.07),
  garbage: () => noise(0.2, 0.6, 300),
  ready: () => tone(midiHz(69), 0.12, 'square', 0.2),
  go: () => tone(midiHz(81), 0.3, 'square', 0.22),
  over: () => arp([67, 63, 60, 55, 51, 48], 0.12, 0.22),
  win: () => arp([72, 0, 72, 76, 79, 0, 76, 79, 84, 84, 84], 0.09, 0.24),
};

// ---------- music ----------

interface Track {
  /** Melody as [midi, length in ticks]; 0 = rest. */
  melody: [number, number][];
  /** Bass note for a tick, or 0 for none. */
  bass: (tick: number) => number;
  /** Seconds per tick at normal speed. */
  tick: number;
}

// A: Korobeiniki (Russian folk song). Ticks are eighth notes.
const KOROBEINIKI: Track = {
  melody: [
    [76, 2], [71, 1], [72, 1], [74, 2], [72, 1], [71, 1],
    [69, 2], [69, 1], [72, 1], [76, 2], [74, 1], [72, 1],
    [71, 3], [72, 1], [74, 2], [76, 2],
    [72, 2], [69, 2], [69, 2], [0, 2],
    [74, 3], [77, 1], [81, 2], [79, 1], [77, 1],
    [76, 3], [72, 1], [76, 2], [74, 1], [72, 1],
    [71, 2], [71, 1], [72, 1], [74, 2], [76, 2],
    [72, 2], [69, 2], [69, 2], [0, 2],
  ],
  bass: (t) => [40, 45, 44, 45, 38, 36, 44, 45][Math.floor(t / 8) % 8] + (t % 2 ? 12 : 0),
  tick: 0.2,
};

// B: Minuet in G (Petzold, long attributed to Bach). 3/4, eighth-note ticks.
const MINUET_A: [number, number][] = [
  [74, 2], [67, 1], [69, 1], [71, 1], [72, 1],
  [74, 2], [67, 2], [67, 2],
  [76, 2], [72, 1], [74, 1], [76, 1], [78, 1],
  [79, 2], [67, 2], [67, 2],
  [72, 2], [74, 1], [72, 1], [71, 1], [69, 1],
  [71, 2], [72, 1], [71, 1], [69, 1], [67, 1],
];
const MINUET: Track = {
  melody: [
    ...MINUET_A,
    [66, 2], [67, 1], [69, 1], [71, 1], [67, 1],
    [69, 6],
    ...MINUET_A,
    [69, 2], [71, 1], [69, 1], [67, 1], [66, 1],
    [67, 6],
  ],
  bass: (t) => {
    if (t % 2) return 0;
    const root = [43, 47, 48, 47, 45, 43, 50, 50, 43, 47, 48, 47, 45, 43, 50, 43][Math.floor(t / 6) % 16];
    return root + [0, 7, 12][(t % 6) / 2];
  },
  tick: 0.19,
};

// C: In the Hall of the Mountain King (Grieg). Speeds up with the level.
const KING_LOW: [number, number][] = [
  [59, 1], [61, 1], [62, 1], [64, 1], [66, 1], [62, 1], [66, 2],
  [65, 1], [61, 1], [65, 2], [64, 1], [60, 1], [64, 2],
  [59, 1], [61, 1], [62, 1], [64, 1], [66, 1], [62, 1], [66, 1], [71, 1],
  [69, 1], [66, 1], [62, 1], [66, 1], [69, 4],
];
const KING_HIGH: [number, number][] = [
  [66, 1], [68, 1], [70, 1], [71, 1], [73, 1], [70, 1], [73, 2],
  [74, 1], [70, 1], [74, 2], [73, 1], [70, 1], [73, 2],
  [66, 1], [68, 1], [70, 1], [71, 1], [73, 1], [70, 1], [73, 1], [78, 1],
  [76, 1], [73, 1], [70, 1], [73, 1], [76, 4],
];
const MOUNTAIN_KING: Track = {
  melody: [...KING_LOW, ...KING_HIGH, ...KING_LOW.slice(0, -1), [71, 4]],
  bass: (t) => (Math.floor(t / 32) % 3 === 1 ? [42, 49] : [47, 54])[t % 2],
  tick: 0.2,
};

const TRACKS = [KOROBEINIKI, MINUET, MOUNTAIN_KING];
export const TRACK_NAMES = ['A', 'B', 'C', 'ALL', 'OFF'];
/** Music selections beyond the single tracks. */
export const MUSIC_ALL = 3;
export const MUSIC_OFF = 4;
/** Times each tune repeats before ALL moves on. */
const ALL_REPEATS = 2;
/** Tracks that speed up with the level. */
export const ACCELERATES = [false, false, true];

const compiled = TRACKS.map((tr) => {
  const notes = new Map<number, [number, number]>();
  let t = 0;
  for (const [m, len] of tr.melody) {
    if (m) notes.set(t, [m, len]);
    t += len;
  }
  return { tr, notes, loop: t };
});

let musicOn = true;
let playing = false;
let current = -1;
/** Playing every tune in turn (ALL). */
let playlist = false;
let tick = 0;
let nextTime = 0;
let speed = 1;
let timer: number | undefined;

function schedule() {
  if (!ctx || current < 0) return;
  while (nextTime < ctx.currentTime + 0.12) {
    if (playlist && tick >= compiled[current].loop * ALL_REPEATS) {
      current = (current + 1) % TRACKS.length;
      tick = 0;
    }
    const { tr, notes, loop } = compiled[current];
    const step = tr.tick / speed;
    const i = tick % loop;
    const n = notes.get(i);
    if (n) tone(midiHz(n[0]), n[1] * step * 0.9, 'square', 0.1, nextTime);
    const b = tr.bass(i);
    if (b) tone(midiHz(b), step * 0.8, 'triangle', 0.35, nextTime);
    tick++;
    nextTime += step;
  }
}

export const music = {
  /** Play a track (0-2), all of them in turn (MUSIC_ALL), or stop (MUSIC_OFF). */
  play(selection: number, restart = false) {
    if (selection >= MUSIC_OFF) return this.stop();
    const all = selection === MUSIC_ALL;
    if (all !== playlist || (!all && selection !== current) || restart) {
      this.halt();
      playlist = all;
      current = all ? 0 : selection;
      tick = 0;
    }
    playing = true;
    if (!ctx || !musicOn || timer !== undefined) return;
    nextTime = ctx.currentTime + 0.05;
    timer = window.setInterval(schedule, 25);
  },
  resume() {
    if (current >= 0) this.play(playlist ? MUSIC_ALL : current);
  },
  stop() {
    playing = false;
    this.halt();
  },
  halt() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  },
  /** Tempo multiplier. */
  setSpeed(s: number) {
    speed = s;
  },
  toggle() {
    musicOn = !musicOn;
    if (!musicOn) this.halt();
    else if (playing) this.resume();
    return musicOn;
  },
  get enabled() {
    return musicOn;
  },
  get running() {
    return timer !== undefined;
  },
  get track() {
    return current;
  },
};
