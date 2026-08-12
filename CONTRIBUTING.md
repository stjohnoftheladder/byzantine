# Contributing (designer-friendly)

Thanks for helping with Fellowship Go! This repo is a small TypeScript + Vite +
Phaser app. **No local tooling is required** — everything below works in the
browser. Start with `DESIGN-HANDOFF.md` (the design brief: direction, tokens,
hard constraints, open questions).

## The golden rules

1. **Branch, don't push to main.** `main` is the live app — every merge deploys.
2. **Keep the constraints** from `DESIGN-HANDOFF.md` (480×854 canvas, 44px touch
   targets, WCAG AA contrast, gold-on-dark palette). CI runs the full 61-check
   suite on every PR — if it fails, it's a real accessibility/UX regression,
   not a nitpick.
3. **One screen per PR** — easier to review and safer to roll back.

## Option A — edit in the browser (recommended, zero setup)

1. Open the repo: `https://github.com/stjohnoftheladder/byzantine`
2. Press the **`.` key** anywhere on the repo page → opens the **github.dev**
   editor (VS Code in your browser). Or use **Codespaces** (green "Code" button).
3. Make your edits. Files you'll touch (see DESIGN-HANDOFF.md §7):
   - `index.html` — screen markup
   - `src/style.css` — all styling and design tokens
   - `public/images/` + `public/assets/fonts/` — art assets (you can drag-drop PNGs)
4. Use the **Source Control** panel (left sidebar) to:
   - type a short message, e.g. "Redesign Fellowship empty state"
   - click the **branch** dropdown → "Create new branch…" → name it `corey/fellowship-empty-state`
   - click **Commit & Push**, then **Create Pull Request** → target `main`
5. Mark reviews the PR; once merged, it deploys automatically.

Previewing your changes: github.dev doesn't run the app. For a quick visual,
open a **Codespace** and run:

```bash
npm install
npm run dev      # then open the http://127.0.0.1:5173 link Codespaces shows
```

## Option B — local (if you have Node.js)

```bash
git clone https://github.com/stjohnoftheladder/byzantine.git
cd byzantine
npm install
npm run dev      # http://127.0.0.1:5173
```

Make a branch, commit, push, open a PR:

```bash
git checkout -b corey/my-change
# ...edit...
npm test         # 61 checks incl. accessibility + tap-target sizes — must pass
git add -A && git commit -m "My change"
git push -u origin corey/my-change
```

## Art assets (important detail)

If you add or replace sprite sheets, keep the **frame coordinates** documented in
`DESIGN-HANDOFF.md` §4 in sync — the CSS crops (`background-position` /
`background-size`) and the Phaser atlas are pixel-exact against them. A one-pixel
shift breaks every avatar.

## If in doubt

Ask Mark. Smaller PRs, earlier — the audience is real parishioners aged 8 to 80.
