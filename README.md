# JTRIS

A NES-style falling-block puzzle game with pixel art, built in TypeScript with no dependencies at runtime. Runs entirely in the browser.

**Play:** https://gh.tschieber.de/jtris/

## Controls

| Key | Action |
| --- | --- |
| ← → | Move |
| ↓ | Soft drop |
| X / ↑ | Rotate clockwise |
| Z / Y | Rotate counter-clockwise |
| Enter | Start / pause |
| M | Music on/off |
| C | Classic / modern colors |
| H | High scores (title screen) |

High scores are stored in your browser's local storage.

## Development

```sh
npm install
npm run dev
npm run build
```

Optional: put your own `public/music.mp3` in place to replace the built-in chiptune (it is git-ignored).
