// On-screen controls for phones and tablets.
import type { GAction } from './game';
import type { PAction } from './player';

export interface TouchButton {
  id: string;
  label: string;
  g?: GAction;
  p?: PAction;
  typed?: string;
  wide?: boolean;
}

const ROWS: TouchButton[][] = [
  [
    { id: 'hold', label: 'HOLD', p: 'hold' },
    // Hard drop with modern rules, rotate with classic; menu up everywhere.
    { id: 'up', label: '▲', g: 'up', p: 'hard' },
    { id: 'music', label: '♪', g: 'mute' },
    { id: 'start', label: 'START', g: 'start', typed: 'Enter' },
  ],
  [
    { id: 'left', label: '◀', g: 'left', p: 'left' },
    { id: 'down', label: '▼', g: 'down', p: 'down' },
    { id: 'right', label: '▶', g: 'right', p: 'right' },
    { id: 'ccw', label: '↺', p: 'ccw' },
    { id: 'cw', label: '↻', p: 'cw', wide: true },
  ],
];

export interface TouchState {
  /** A game is running (not a menu). */
  playing: boolean;
  modern: boolean;
  musicOn: boolean;
}

export interface TouchPanel {
  el: HTMLElement;
  update(s: TouchState): void;
}

/** Builds the touch panel on touch devices; returns it, or null elsewhere. */
export function setupTouch(onButton: (b: TouchButton, down: boolean) => void): TouchPanel | null {
  if (!matchMedia('(pointer: coarse)').matches) return null;
  const panel = document.createElement('div');
  panel.id = 'touch';
  const els = new Map<string, HTMLButtonElement>();
  const buttons = new Map<string, TouchButton>();

  for (const row of ROWS) {
    const r = document.createElement('div');
    r.className = 'row';
    for (const b of row) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.wide) el.classList.add('wide');
      const release = () => {
        el.classList.remove('on');
        onButton(b, false);
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('on');
        onButton(b, true);
      });
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      els.set(b.id, el);
      buttons.set(b.id, b);
      r.appendChild(el);
    }
    panel.appendChild(r);
  }
  document.body.appendChild(panel);
  document.body.classList.add('has-touch');

  let last = '';
  return {
    el: panel,
    update(s) {
      const key = `${s.playing}${s.modern}${s.musicOn}`;
      if (key === last) return;
      last = key;
      const up = buttons.get('up')!;
      up.p = s.modern ? 'hard' : 'cw';
      els.get('up')!.textContent = !s.playing ? '▲' : s.modern ? '▲ DROP' : '▲ ROT';
      els.get('hold')!.classList.toggle('off', s.playing && !s.modern);
      els.get('music')!.textContent = s.musicOn ? '♪' : '♪ OFF';
      els.get('music')!.classList.toggle('off', !s.musicOn);
    },
  };
}
