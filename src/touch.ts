// On-screen controls for phones and tablets, on arcade-kit's touch panel. JTRIS' buttons act in
// the menus (a) and for the player (p), and the up button changes with the rules.
import { setupTouch as kitSetupTouch, TouchButton as KitButton } from 'arcade-kit/touch';
import type { GAction } from './game';
import type { PAction } from './player';

/** `a` is the menu action, '' for none; `p` the player's. */
export interface TouchButton extends KitButton<GAction | ''> {
  p?: PAction;
}

const ROWS: TouchButton[][] = [
  [
    { id: 'hold', label: 'HOLD', a: '', p: 'hold' },
    // Hard drop with modern rules, rotate with classic; menu up everywhere.
    { id: 'up', label: '▲', a: 'up', p: 'hard' },
    { id: 'music', label: '♪', a: 'mute' },
    { id: 'start', label: 'START', a: 'start', typed: 'Enter' },
  ],
  [
    { id: 'left', label: '◀', a: 'left', p: 'left' },
    { id: 'down', label: '▼', a: 'down', p: 'down' },
    { id: 'right', label: '▶', a: 'right', p: 'right' },
    { id: 'ccw', label: '↺', a: '', p: 'ccw' },
    { id: 'cw', label: '↻', a: '', p: 'cw', wide: true },
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
  const panel = kitSetupTouch(ROWS, (b, down) => onButton(b as TouchButton, down));
  if (!panel) return null;
  const { els } = panel;
  const up = ROWS.flat().find((b) => b.id === 'up')!;

  let last = '';
  return {
    el: panel.el,
    update(s) {
      panel.update(s.musicOn);
      const key = `${s.playing}${s.modern}`;
      if (key === last) return;
      last = key;
      up.p = s.modern ? 'hard' : 'cw';
      els.get('up')!.textContent = !s.playing ? '▲' : s.modern ? '▲ DROP' : '▲ ROT';
      els.get('hold')!.classList.toggle('off', s.playing && !s.modern);
    },
  };
}
