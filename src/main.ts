import { Game, GAction, Input } from './game';
import { PAction } from './player';
import { render, W, H, setHeldForDisplay } from './render';
import { unlockAudio, music } from './audio';
import { setupTouch, TouchButton } from './touch';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

const touchPanel = setupTouch(onTouch);

function resize() {
  const reserved = touchPanel ? touchPanel.el.offsetHeight + 8 : 0;
  const scale = Math.min(innerWidth / W, (innerHeight - reserved) / H);
  // Whole-number scaling keeps pixels crisp; phones may need a fractional fit.
  const s = scale >= 2 ? Math.floor(scale) : Math.max(0.5, scale);
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
}
addEventListener('resize', resize);
resize();

// Menu and system keys, by e.key so labels match any layout.
const GLOBAL: Record<string, GAction> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  enter: 'start',
  p: 'start',
  escape: 'back',
  backspace: 'quit',
  m: 'mute',
  c: 'colors',
  h: 'scores',
};
// Single player, by e.key (y also works as z for QWERTZ).
const SINGLE: Record<string, PAction> = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowdown: 'down',
  arrowup: 'cw',
  x: 'cw',
  k: 'cw',
  z: 'ccw',
  y: 'ccw',
  j: 'ccw',
  ' ': 'hard',
  shift: 'hold',
  a: 'hold',
};
// Versus, by physical key position (e.code).
const VS1: Record<string, PAction> = { KeyA: 'left', KeyD: 'right', KeyS: 'down', KeyW: 'cw', KeyQ: 'ccw', Space: 'hard', KeyE: 'hold' };
const VS2: Record<string, PAction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowUp: 'cw',
  Period: 'ccw',
  ShiftRight: 'hard',
  Slash: 'hold',
};

const game = new Game();
const input: Input = {
  held: new Set(),
  pressed: new Set(),
  players: [
    { held: new Set(), pressed: new Set() },
    { held: new Set(), pressed: new Set() },
  ],
  typed: [],
};

/** Keys currently down: e.code -> lower-cased e.key at press time. */
const heldKeys = new Map<string, string>();
const touchHeld = new Set<TouchButton>();

function actionsFor(code: string, key: string) {
  const g = GLOBAL[key];
  if (game.versus) return { g, p1: VS1[code], p2: VS2[code] };
  return { g, p1: SINGLE[key], p2: undefined };
}

addEventListener('keydown', (e) => {
  unlockAudio();
  const key = e.key.toLowerCase();
  if (/^[a-z0-9]$/i.test(e.key) && !e.repeat) input.typed.push(e.key.toUpperCase());
  else if (e.key === 'Backspace' || (e.key === 'Enter' && !e.repeat)) input.typed.push(e.key);

  const { g, p1, p2 } = actionsFor(e.code, key);
  if (g || p1 || p2 || e.key === 'Backspace') e.preventDefault();
  heldKeys.set(e.code, key);
  if (e.repeat) return;
  if (g) input.pressed.add(g);
  if (p1) input.players[0].pressed.add(p1);
  if (p2) input.players[1].pressed.add(p2);
});
addEventListener('keyup', (e) => heldKeys.delete(e.code));
// Any tap unlocks sound; mobile browsers only allow it after a gesture.
for (const ev of ['pointerdown', 'pointerup', 'touchend']) addEventListener(ev, unlockAudio, { passive: true });
addEventListener('blur', () => {
  heldKeys.clear();
  const active = game.phase === 'play' || game.phase === 'ready';
  if (active && !game.paused) input.pressed.add('start');
});

function onTouch(b: TouchButton, down: boolean) {
  unlockAudio();
  if (!down) {
    touchHeld.delete(b);
    return;
  }
  touchHeld.add(b);
  if (b.g) input.pressed.add(b.g);
  if (b.p) input.players[0].pressed.add(b.p);
  if (b.typed) input.typed.push(b.typed);
}

// Gamepads, in the standard mapping. In the menus: d-pad or left stick, A confirms, B goes back,
// Start, Select quits from pause, Y opens the scores on the title screen. In play: left, right
// and down move, Up drops, A turns clockwise, B or Y the other way, X or a shoulder button holds,
// Start pauses. In versus the first pad plays left, the second right. Typing a name: Up/Down pick
// a letter, A or Start enters it, B rubs one out.
const STICK = 0.4;
let padGHeld = new Set<GAction>();
const padPHeld: [Set<PAction>, Set<PAction>] = [new Set(), new Set()];

function pollPads() {
  const active = game.phase === 'play' || game.phase === 'ready';
  const g = new Set<GAction>();
  const ps: [Set<PAction>, Set<PAction>] = [new Set(), new Set()];
  let slot = 0;
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue;
    const on = (i: number) => !!pad.buttons[i]?.pressed;
    const [x = 0, y = 0] = pad.axes;
    const up = on(12) || y < -STICK, down = on(13) || y > STICK, left = on(14) || x < -STICK, right = on(15) || x > STICK;
    if (on(9)) g.add('start');
    if (on(8)) g.add('quit');
    if (active) {
      const p = ps[game.versus ? slot : 0];
      if (slot < 2 || !game.versus) {
        if (left) p.add('left');
        if (right) p.add('right');
        if (down) p.add('down');
        if (up) p.add('hard');
        if (on(0)) p.add('cw');
        if (on(1) || on(3)) p.add('ccw');
        if (on(2) || on(4) || on(5)) p.add('hold');
      }
    } else {
      if (up) g.add('up');
      if (down) g.add('down');
      if (left) g.add('left');
      if (right) g.add('right');
      if (on(0)) g.add('start');
      if (on(1)) g.add('back');
      if (on(3) && game.phase === 'title') g.add('scores');
    }
    slot++;
  }
  for (const a of g) {
    input.held.add(a);
    if (padGHeld.has(a)) continue;
    unlockAudio();
    if (game.phase === 'entry' && (a === 'start' || a === 'back')) input.typed.push(a === 'start' ? 'Enter' : 'Backspace');
    else input.pressed.add(a);
  }
  padGHeld = g;
  ps.forEach((set, i) => {
    for (const a of set) {
      input.players[i].held.add(a);
      if (!padPHeld[i].has(a)) input.players[i].pressed.add(a);
    }
    padPHeld[i] = set;
  });
}

function refreshHeld() {
  input.held.clear();
  for (const p of input.players) p.held.clear();
  for (const [code, key] of heldKeys) {
    const { g, p1, p2 } = actionsFor(code, key);
    if (g) input.held.add(g);
    if (p1) input.players[0].held.add(p1);
    if (p2) input.players[1].held.add(p2);
  }
  for (const b of touchHeld) {
    if (b.g) input.held.add(b.g);
    if (b.p) input.players[0].held.add(b.p);
  }
  pollPads();
}
setHeldForDisplay(input.players[0].held);

// Fixed 60 Hz simulation, like the NES.
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();
let frame = 0;

function loop(now: number) {
  acc += Math.min(250, now - last);
  last = now;
  while (acc >= STEP) {
    refreshHeld();
    game.step(input);
    input.pressed.clear();
    for (const p of input.players) p.pressed.clear();
    input.typed.length = 0;
    acc -= STEP;
    frame++;
  }
  render(ctx, game, frame);
  touchPanel?.update({
    playing: game.players.length > 0 && game.phase !== 'title',
    modern: game.players[0]?.cfg.modern ?? game.modern,
    musicOn: music.enabled,
  });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) Object.assign(window, { game, music });
