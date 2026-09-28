// On-screen controls for phones and tablets.
import type { GAction } from './game';
import type { PAction } from './player';

export interface TouchButton {
  label: string;
  g?: GAction;
  p?: PAction;
  typed?: string;
  wide?: boolean;
}

const ROWS: TouchButton[][] = [
  [
    { label: 'HOLD', p: 'hold' },
    { label: '▲', g: 'up', p: 'hard' },
    { label: 'START', g: 'start', typed: 'Enter' },
  ],
  [
    { label: '◀', g: 'left', p: 'left' },
    { label: '▼', g: 'down', p: 'down' },
    { label: '▶', g: 'right', p: 'right' },
    { label: '↺', p: 'ccw' },
    { label: '↻', p: 'cw', wide: true },
  ],
];

/** Builds the touch panel on touch devices; returns it, or null elsewhere. */
export function setupTouch(onButton: (b: TouchButton, down: boolean) => void) {
  if (!matchMedia('(pointer: coarse)').matches) return null;
  const panel = document.createElement('div');
  panel.id = 'touch';
  for (const row of ROWS) {
    const r = document.createElement('div');
    r.className = 'row';
    for (const b of row) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.wide) el.className = 'wide';
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
      r.appendChild(el);
    }
    panel.appendChild(r);
  }
  document.body.appendChild(panel);
  document.body.classList.add('has-touch');
  return panel;
}
