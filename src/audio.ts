// Tiny Web Audio chiptune synth: SFX + Korobeiniki ("Music A").
let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;

export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    void loadTrack();
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
  notes.forEach((n, i) => tone(midiHz(n), step, 'square', vol, t + i * step));
}

export const sfx = {
  move: () => tone(1400, 0.02, 'square', 0.12),
  rotate: () => tone(600, 0.05, 'square', 0.18, 0, 1200),
  lock: () => noise(0.09, 0.5, 900),
  select: () => tone(988, 0.04, 'square', 0.18),
  start: () => arp([72, 76, 79, 84], 0.05),
  pause: () => arp([84, 79], 0.06, 0.18),
  clear: () => arp([79, 83, 86, 91], 0.045),
  tetris: () => arp([72, 76, 79, 84, 88, 91, 96, 91, 96], 0.05),
  level: () => arp([84, 88, 91, 96], 0.07),
  over: () => arp([67, 63, 60, 55, 51, 48], 0.12, 0.22),
};

// Melody as [midi, eighths]; 0 = rest. Eight bars of 8 eighths.
const MELODY: [number, number][] = [
  [76, 2], [71, 1], [72, 1], [74, 2], [72, 1], [71, 1],
  [69, 2], [69, 1], [72, 1], [76, 2], [74, 1], [72, 1],
  [71, 3], [72, 1], [74, 2], [76, 2],
  [72, 2], [69, 2], [69, 2], [0, 2],
  [74, 3], [77, 1], [81, 2], [79, 1], [77, 1],
  [76, 3], [72, 1], [76, 2], [74, 1], [72, 1],
  [71, 2], [71, 1], [72, 1], [74, 2], [76, 2],
  [72, 2], [69, 2], [69, 2], [0, 2],
];
const BASS_ROOTS = [40, 45, 44, 45, 38, 36, 44, 45]; // E A G# A D C G# A
const LOOP = 64;
const noteAt = new Map<number, [number, number]>();
{
  let t = 0;
  for (const [m, len] of MELODY) {
    if (m) noteAt.set(t, [m, len]);
    t += len;
  }
}

let musicOn = true;
let playing = false;
let tick = 0;
let nextTime = 0;
let timer: number | undefined;
const EIGHTH = 0.2;

function schedule() {
  if (!ctx) return;
  while (nextTime < ctx.currentTime + 0.12) {
    const i = tick % LOOP;
    const n = noteAt.get(i);
    if (n) tone(midiHz(n[0]), n[1] * EIGHTH * 0.9, 'square', 0.1, nextTime);
    const root = BASS_ROOTS[Math.floor(i / 8)];
    tone(midiHz(root + (i % 2 ? 12 : 0)), EIGHTH * 0.8, 'triangle', 0.35, nextTime);
    tick++;
    nextTime += EIGHTH;
  }
}

// Optional music file: drop public/music.mp3 in and it replaces the chiptune.
let track: AudioBuffer | null = null;
let trackSrc: AudioBufferSourceNode | null = null;
let trackGain: GainNode;
let trackOffset = 0;
let trackStartedAt = 0;

async function loadTrack() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}music.mp3`);
    if (!res.ok || !res.headers.get('content-type')?.startsWith('audio')) return;
    track = await ctx!.decodeAudioData(await res.arrayBuffer());
    trackGain = ctx!.createGain();
    trackGain.gain.value = 1.6; // master is quiet, tuned for the synth
    trackGain.connect(master);
    // Switch over if the synth already started.
    if (timer !== undefined) {
      music.halt();
      music.play();
    }
  } catch {
    track = null;
  }
}

export const music = {
  play(restart = false) {
    if (restart) {
      tick = 0;
      trackOffset = 0;
    }
    playing = true;
    if (!ctx || !musicOn || timer !== undefined || trackSrc) return;
    if (track) {
      trackSrc = ctx.createBufferSource();
      trackSrc.buffer = track;
      trackSrc.loop = true;
      trackSrc.connect(trackGain);
      trackSrc.start(0, trackOffset % track.duration);
      trackStartedAt = ctx.currentTime - trackOffset;
      return;
    }
    nextTime = ctx.currentTime + 0.05;
    timer = window.setInterval(schedule, 25);
  },
  stop() {
    playing = false;
    this.halt();
  },
  halt() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    if (trackSrc && ctx) {
      trackOffset = ctx.currentTime - trackStartedAt;
      trackSrc.stop();
      trackSrc = null;
    }
  },
  toggle() {
    musicOn = !musicOn;
    if (!musicOn) this.halt();
    else if (playing) this.play();
    return musicOn;
  },
  get enabled() {
    return musicOn;
  },
};
