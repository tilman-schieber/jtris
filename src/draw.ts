// Low-level pixel drawing: blocks, panels, backgrounds.
import { STYLE, PALETTES, MODERN_COLORS } from './pieces';

export { MODERN_COLORS };
export const W = 256;
export const H = 224;
export const WHITE = '#fcfcfc';
export const RED = '#f83800';
export const GREY = '#7c7c7c';
export const LIGHT = '#bcbcbc';
export const DARK = '#383838';
export const YELLOW = MODERN_COLORS[3];
/** Board value 8 (piece type 7) is versus garbage. */
export const GARBAGE = 7;

export type Ctx = CanvasRenderingContext2D;

export const palette = (level: number) => PALETTES[level % PALETTES.length];

export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Main color of a block, for particles and ghosts. */
export function blockColor(type: number, level: number, modern: boolean) {
  if (type === GARBAGE) return GREY;
  if (modern) return MODERN_COLORS[type];
  const [c1, c2] = palette(level);
  return STYLE[type] === 2 ? c2 : STYLE[type] === 0 ? WHITE : c1;
}

function drawModernBlock(ctx: Ctx, x: number, y: number, c: string) {
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
export function drawBlock(ctx: Ctx, x: number, y: number, type: number, level: number, modern: boolean) {
  if (type === GARBAGE) return drawModernBlock(ctx, x, y, GREY);
  if (modern) return drawModernBlock(ctx, x, y, MODERN_COLORS[type]);
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

/** Outline where the piece will land. */
export function drawGhost(ctx: Ctx, x: number, y: number, color: string) {
  ctx.fillStyle = mix(color, '#000000', 0.55);
  ctx.fillRect(x, y, 7, 1);
  ctx.fillRect(x, y + 6, 7, 1);
  ctx.fillRect(x, y, 1, 7);
  ctx.fillRect(x + 6, y, 1, 7);
}

// Brick wall background, tinted by the level palette. Cached per palette.
const bgCache = new Map<number, HTMLCanvasElement>();
export function background(level: number) {
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
      g.fillRect(bx + 4 + ((row * 5) % 7), y + 3, 1, 1);
      g.fillStyle = dark;
      g.fillRect(bx + 10 - ((row * 3) % 5), y + 5, 1, 1);
    }
  }
  bgCache.set(key, c);
  return c;
}

// Framed black panel with rounded corners; (x, y, w, h) is the outer edge.
export function drawBox(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const ring = (i: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + i, y + i, w - 2 * i, h - 2 * i);
  };
  ring(0, '#000');
  ring(1, LIGHT);
  ring(2, WHITE);
  ring(3, '#585858');
  ring(4, '#000');
  ctx.fillStyle = '#000';
  for (const [cx, cy] of [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 2], [x + w - 2, y + h - 2]])
    ctx.fillRect(cx, cy, 1, 1);
}

export const pad = (n: number, len: number) => String(n).padStart(len, '0');
