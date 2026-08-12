# Fellowship Go — Design Handoff (Corey)

> For the designer (Corey) starting UI/UX + art work. Read this first, then open the app.
> Last updated: 2026-08-12 · Live app: **https://byzantine-2yy.pages.dev**

---

## 1. What the product is

**Fellowship Go** is a parish gateway + pixel-art fellowship hub for Orthodox parishes. A parishioner opens a link, recognizes their parish, finds the next parish meet, RSVPs "I'm coming," and can step into a pixel courtyard **hub** to meet fellow parishioners — wave, jump into a 90-second video conversation, earn fellowship points.

- **Audience:** non-technical, wide age range (elderly → young). *Simpler is better.* Large touch targets, high contrast, 9:16 portrait on phones.
- **No accounts.** Identity is a client-generated UUID in `localStorage`. This is a product decision, not a limitation — never design for login walls.
- **Current scope (pilot):** single parish — Ss. George & Alexandra, Fort Smith, AR. Meet: Friday, August 28, 7:30 PM. Pilot test at that meet.
- **Mid-term direction (design with this in mind):** pan-Orthodox — multiple parishes, a parish picker on first open, shared fellowship hub. RSVP data moves to Supabase. A custom domain is coming.

## 2. Visual direction — "Byzantine Parchment Pixel"

Established and working; evolve it, don't replace it:

- **Dark sanctuary atmosphere:** deep warm browns, gold illumination, candle-light glow accents
- **Pixel-art sprites** (existing `os_peer` character sheets) on DOM screens — not full canvas; the hub is Phaser
- **Gold-bordered cards** with offset outline (border-image was tried and rendered grey — don't reintroduce it)
- **Calm, large, one-question-per-screen** interactions
- **Hub vision pass (implemented):** warm candle glows (`addGlow`), additive pools of candle-light on the floor, and a dark-gold camera vignette — dark-gold-lit and still readable

## 3. Design tokens (current, in `src/style.css`)

```css
--bg:       #120d07;   /* page background — near-black warm brown */
--surface:  #1a140d;   /* card background */
--gold:     #f3d276;   /* primary accent, headings, primary buttons */
--gold-dim: #c4a46c;   /* borders, secondary text accents */
--text:     #e8dcc8;   /* body text */
--accent:   #8b6914;   /* muted gold fills (e.g. "You're coming") */
```

**Hard requirements:** text contrast ≥ 4.5:1 (WCAG AA), touch targets ≥ 44×44px, pinch-zoom enabled (never add `user-scalable=no`), safe-area insets for iPhone notches.

## 4. Hard constraints (locked, don't redesign around these)

| Constraint | Value |
|---|---|
| Phaser canvas | **480×854** (portrait 9:16), `scale: FIT` |
| Character sheets | `public/images/os_peer-sheet0/1/2.png` (128×128 each) — reuse for player + attendee art |
| Sprite frame coords | `os_peer-sheet0`: frames at (1,1) 39×57 and (83,1) 40×52; avatar crop = frame 0 face region (`background-position: -6px -1px`, `background-size: 128px 128px`) |
| Fonts available | `public/assets/fonts/`: PixelEmulator, SFPixelate, CyrillicPixel, Miludaland (Georgia serif used for headings) |
| Framework | TypeScript + Vite + Phaser 4 (hub) — no new dependencies without checking with the developer |
| PWA | Service worker network-first, cache `byzantine-v2`; manifest title "Fellowship Go" |
| Hub art slots | **`src/hub-art/`** — drop-in PNGs, detected at build time: `hub-world.png` (portrait world bg, 480×854 or larger), `hub-floor-tile.png` (seamless square tile), `hub-candle.png` (single-frame candle). Missing files fall back to built-in placeholders; files must be committed (build-time detection) |
| Hub lighting | **Additive warm light pools + `addGlow` accents + camera vignette** — NOT the v4 lights pipeline (dark floor textures multiply to near-black under a dark ambient; pools keep it readable) |

## 5. Screen inventory (all in `index.html`, styles in `src/style.css`)

| Screen | Element ID | Purpose / notes |
|---|---|---|
| Welcome | `#fg-welcome` | "Fellowship Go", parish preview, **Join my parish** / **Explore first** buttons |
| Parish card | `#fg-parish-card` | Parish info + next meet + **Join** (the "Explore first" path) |
| My Parish | `#fg-my-parish` | Home after joining: meet highlight, **I'm coming** RSVP state, attendee list, **Enter the Hub** |
| Fellowship | `#fg-fellowship` | Connections list (people met in video) — has a weak empty state, needs design love |
| Name dialog | `#fg-name-dialog` | Styled first-name entry (replaces native prompt) |
| Bottom nav | `#fg-nav` | My Parish / Fellowship |
| Feedback | `#fg-feedback` | Post-meet emoji rating (Good/OK/Bad + Skip) |
| Player card | `#player-card` | Tap a pilgrim sprite in the hub → name, parish, **Wave** |
| Video overlay | `#video-conversation` | 90s Daily.co call: timer, join/leave, status |
| Points HUD | `#points-hud` | Top-right during hub |
| Toast | `#toast` | System messages (points earned, etc.) |
| Hub (Phaser) | `src/HubScene.ts` | 480×854 dark-gold-lit courtyard: stone floor (tile), 3 candles with glow + light pools, fountain, Ladder door, tap-to-move, sprite tap → player card |

## 6. Where design help is wanted (tonight's open questions)

1. **Multi-parish home (mid-term):** when a second parish joins, first-open needs a clear parish picker + confirmation of *your* parish. Sketch options for one-tap pick + "is this you?" pattern.
2. **Hub art — mechanism done, awaiting your art:** the drop-in slots are live (see §4). Deliver `hub-world.png`, `hub-floor-tile.png`, `hub-candle.png` into `src/hub-art/` and they replace the placeholders automatically. Character art / idle animations for the courtyard is the remaining piece (current = stand-in `os_peer` sprites); keep 480×854 layout, tap-to-move, sprite tap → player card.
3. **Empty & first-run states:** Fellowship list empty state, attendee list with one person, hub with nobody around — make these encouraging, not dead ends.
4. **Iconography:** nav icons, meet-card icons, wave gesture — pixel-art set consistent with the sheets.
5. **Fellowship points presentation:** how points are shown/celebrated (current: plain number HUD + toast) — make earning feel rewarding without gamifying beyond the calm tone.

## 7. Files you'll touch

- `index.html` — screen markup
- `src/style.css` — all tokens + styling
- `src/fellowship-go.ts` — DOM screen logic (labels, ordering)
- `src/HubScene.ts` — hub layout, sprite placement, lighting/filters
- **`src/hub-art/` — your art drop-in folder** (see §4): `hub-world.png`, `hub-floor-tile.png`, `hub-candle.png`
- `public/images/` + `public/assets/fonts/` — art assets

## 8. Running it

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm test         # Playwright + axe-core — 61 checks, incl. iPhone/Android/tablet emulation
```

`npm test` gates every change (it checks tap-target sizes, contrast via axe, and screenshots). Design changes that break a check will fail CI-style locally — that's intended; keep the audience constraints in mind.

## 9. Do / Don't

- **Do** keep one question per screen; big calm buttons; gold-on-dark hierarchy; safe areas; readable at pinch-zoom.
- **Do** reuse existing sprite sheets and fonts where possible.
- **Don't** introduce login/accounts, maps, or multi-step forms — all deliberately deferred.
- **Don't** change the 480×854 canvas, add dependencies, or re-introduce border-image cards.
- **Don't** ship grey-on-dark low-contrast text (axe will flag it).

## 10. Reference material

- Architecture + deployment: `HANDOFF.md` (in this repo)
- Test plan: `fg-tests.mjs` documents every covered flow
