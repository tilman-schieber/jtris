# JTRIS

A NES-style falling-block puzzle game with pixel art, built in TypeScript with no runtime dependencies. Runs entirely in the browser.

**Play:** https://gh.tschieber.de/jtris/

## Modes

| Mode | Goal |
| --- | --- |
| A-TYPE | Endless marathon, NES level progression |
| B-TYPE | Clear 25 lines, optionally starting on garbage (height 0–12) |
| SPRINT | Clear 40 lines as fast as possible |
| ULTRA | Score as much as possible in 2 minutes |
| 20G | Pieces drop instantly. Clear 100 lines, then survive a 60 s invisible roll |
| HATE | The game always hands you the worst possible piece |
| VERSUS | Local 2-player, clears send garbage to your opponent |

**Rules:** *Classic* plays like the NES (no hold, no hard drop, no kicks, NES randomizer and timing). *Modern* adds hold, hard drop, ghost piece, 5-piece preview, 7-bag, SRS wall kicks, lock delay, T-spins, combos and back-to-back bonuses.

**Seed:** *Daily* gives everyone the same piece order for the day.

**Music:** A – Korobeiniki, B – Minuet in G (Petzold), C – In the Hall of the Mountain King (Grieg, speeds up with the level). *ALL* plays the three in turn. All public-domain melodies in original chiptune arrangements.

## Controls

| Key | Action |
| --- | --- |
| ← → | Move |
| ↓ | Soft drop |
| X / ↑ | Rotate clockwise |
| Z / Y | Rotate counter-clockwise |
| Space | Hard drop (modern) |
| Shift / A | Hold (modern) |
| Enter / Esc | Start / pause |
| Backspace | Quit to menu (while paused) |
| M | Music on/off |
| C | Classic / modern colors |
| H | High scores (title screen) |

**Versus:** 1P uses W A S D, Q (rotate CCW), Space (drop), E (hold). 2P uses the arrows, `.` (rotate CCW), Right Shift (drop), `/` (hold).

Touch controls appear automatically on phones and tablets.

High scores: the top 10 per mode, both worldwide and in your own browser (Up/Down switches between them on the score screen). World scores live in a small [Val Town](https://www.val.town/x/tilmanschieber/jtris-scores) val with a SQLite table; your own scores and settings stay in the browser's local storage, so they still work offline. Games finished while the server can't be reached wait in local storage and are sent the next time the score screen opens.

## Development

```sh
npm install
npm run dev
npm run build
```
