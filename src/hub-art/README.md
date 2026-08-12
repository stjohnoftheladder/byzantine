# Hub art slots (Corey)

Drop PNG files in this folder with these names and the hub uses them
automatically on the next build — no code changes. Missing files fall back to
the built-in placeholders.

| File | Purpose | Spec |
|---|---|---|
| `hub-world.png` | Full world background | Portrait, 480×854 or larger (world art); dark-gold-lit tone |
| `hub-floor-tile.png` | Walkable floor | Seamless square tile (e.g. 64×64), edges must tile |
| `hub-candle.png` | Candle decoration | Single frame, small (e.g. 16×24), drawn at the base (flame up) |

Rules:

- Files must be committed — detection happens at build time (`npm run build`
  or CI), so a file that only exists locally won't deploy.
- Keep the canvas constraint: the hub renders at 480×854 (`scale: FIT`).
- Character sprites stay as `public/images/os_peer-sheet*.png` for now —
  replacing those is a separate step.
