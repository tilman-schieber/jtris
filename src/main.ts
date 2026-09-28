import { Game, Action, Input } from './game';
import { render, W, H } from './render';
import { unlockAudio } from './audio';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;

function resize() {
  const scale = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
}
addEventListener('resize', resize);
resize();

// Key names by e.key so labels match any layout (y also works as z for QWERTZ).
const KEYS: Record<string, Action> = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  x: 'rotCW',
  k: 'rotCW',
  z: 'rotCCW',
  y: 'rotCCW',
  j: 'rotCCW',
  enter: 'start',
  p: 'start',
  escape: 'start',
  m: 'mute',
  c: 'colors',
  h: 'scores',
};

const input: Input = { held: new Set(), pressed: new Set(), typed: [] };
const game = new Game();

addEventListener('keydown', (e) => {
  if (/^[a-z0-9]$/i.test(e.key) && !e.repeat) input.typed.push(e.key.toUpperCase());
  else if (e.key === 'Backspace' || (e.key === 'Enter' && !e.repeat)) input.typed.push(e.key);
  if (e.key === 'Backspace') e.preventDefault();
  const action = KEYS[e.key.toLowerCase()];
  if (!action) return;
  e.preventDefault();
  unlockAudio();
  if (!e.repeat) input.pressed.add(action);
  input.held.add(action);
});
addEventListener('keyup', (e) => {
  const action = KEYS[e.key.toLowerCase()];
  if (action) input.held.delete(action);
});
addEventListener('blur', () => {
  input.held.clear();
  const active = game.phase === 'play' || game.phase === 'clear' || game.phase === 'are';
  if (active && !game.paused) input.pressed.add('start');
});

// Fixed 60 Hz simulation, like the NES.
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();
let frame = 0;

function loop(now: number) {
  acc += Math.min(250, now - last);
  last = now;
  while (acc >= STEP) {
    game.step(input);
    input.pressed.clear();
    input.typed.length = 0;
    acc -= STEP;
    frame++;
  }
  render(ctx, game, frame);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) Object.assign(window, { game });
