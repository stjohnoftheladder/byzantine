# Fellowship Go — Project Handoff

## What it is

Fellowship Go is a browser-based parish fellowship experience for **Ss. George & Alexandra Orthodox Church** in Fort Smith, Arkansas. It lets parishioners RSVP for parish meets, see who else is coming, enter a pixel-art hub to meet each other via video calls, and build a fellowship record of real connections.

No install. No accounts. One link.

## Live URLs

| Service | URL |
|---|---|
| **Frontend** | `https://04e4d115.byzantine-2yy.pages.dev` (rotates per deploy — latest at `byzantine-2yy.pages.dev`) |
| **Worker** | `https://byzantine-multiplayer.mark-abella.workers.dev` |
| **Git** | `C:\Users\ABC\AppData\Roaming\reasonix\global-workspace\byzantine\` |

## Architecture

```
Fellowship Go (index.html + DOM screens)
    │
    ├─ FG Welcome ──► FG Parish Card ──► My Parish (RSVP, attendees)
    │                                        │
    │                                   "Enter the Hub"
    │                                        │
    ├─ Byzantine Hub ←──────────────────────┘
    │   (Phaser 4.2.1, 480×854 courtyard)
    │   ├─ MultiplayerClient ──► Cloudflare Worker (Durable Object)
    │   ├─ DailyConversation ──► Daily.co (video calls)
    │   └─ Points system (DO SQLite)
    │
    └─ Fellowship screen (connection list via localStorage)
```

## Tech stack

| Layer | Technology |
|---|---|
| Game engine | Phaser 4.2.1 + TypeScript |
| Build | Vite 7 |
| Hosting | Cloudflare Pages |
| Realtime | Cloudflare Durable Objects (WebSocket + SQLite) |
| Video calls | Daily.co (provisioned via DO) |
| Identity | localStorage (name + UUID) |
| RSVP | localStorage (pilot) |
| PWA | Service worker + manifest |

## Key files

| File | Purpose |
|---|---|
| `index.html` | 4 FG screens + hub container + video dialogs |
| `src/main.ts` | Gateway: FG ↔ Hub, video flow, event wiring |
| `src/HubScene.ts` | Phaser courtyard, player + remote sprites, multiplayer |
| `src/LadderScene.ts` | St. John of the Ladder mini-game placeholder |
| `src/fellowship-go.ts` | FG screen controller, RSVP, attendees, feedback |
| `src/multiplayer/MultiplayerClient.ts` | WebSocket client (presence, chat, video signaling) |
| `src/video/DailyConversation.ts` | Daily.co iframe integration |
| `src/atlas.ts` | Sprite sheet frame definitions |
| `src/save.ts` | Byzantine save data (localStorage) |
| `src/events.ts` | Phaser event bus constants |
| `src/types.ts` | TypeScript interfaces |
| `src/style.css` | All CSS (FG screens + hub overlay + pixel-art) |
| `multiplayer-worker/src/index.ts` | Durable Object (presence, chat, video, points, SQLite) |

## Commands

```bash
npm install          # Install frontend deps
npm run dev          # Dev server at 127.0.0.1:5173
npm run build        # TypeScript check + Vite build to dist/

# Worker
cd multiplayer-worker
npm install
npm run deploy       # Deploy worker to Cloudflare
```

## Secrets (Cloudflare Worker)

```
DAILY_API_KEY        # Daily.co API key
DAILY_SUBDOMAIN      # Daily.co subdomain (e.g. parish-meet)
```

Set via `npx wrangler secret put <name>` from `multiplayer-worker/`.

## Points system

Three point events, server-validated in the Durable Object:

| Event | Award | Guardrail |
|---|---|---|
| Meet someone new | +1 each | Once per pair, ever (`met_pairs` table) |
| Truly speak (≥20s) | +1 each | Once per pair per day |
| Attend Parish Meet | +1 each | Host-only button (`?host` URL param) |

## Pilot plan (Aug 28, 2026)

1. Share the URL with 6-10 parishioners
2. They open it → see Fellowship Go welcome → "Join my parish" → "I'm coming"
3. On Aug 28 at 7:30 PM, they open the link → "Enter the Hub" → courtyard with sprites
4. Tap someone → Wave → 90s video call → +1 point
5. Host (`?host`) grants Parish Meet points at the end
6. Next visit after Aug 28: feedback prompt appears

## What's deferred

| Item | Status |
|---|---|
| Supabase integration for RSVP | Post-pilot (currently localStorage) |
| Multi-parish map | Post-pilot |
| Corey's sprite art | Post-pilot (using Ladder's existing sheets) |
| Full 30-rung Ladder game | Post-pilot (placeholder scene working) |
| Email/SMS reminders | Parish Meet worker exists, not wired yet |

## Known quirks

- `border-image` for pixel-art dialog frames works in all modern browsers but may look slightly different across rendering engines. The `fill` keyword ensures the center is filled.
- The two `os_peer` idle sprites on the welcome screen use absolute positioning within `.fg-parish-preview` — if the card width changes significantly, adjust `.fg-sprite-left` and `.fg-sprite-right` offsets.
- The feedback prompt date check (`isAfterMeet`) is hardcoded to Aug 28, 2026. Update for future meets.
