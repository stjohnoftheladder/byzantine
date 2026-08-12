# Fellowship Go

A parish gateway + pixel-art fellowship hub for Orthodox parishes. Parishioners open a link, recognize their parish, find the next parish meet, RSVP "I'm coming," and can enter a pixel courtyard hub to meet fellow parishioners — wave, join a 90-second video conversation, and earn fellowship points.

Live app: https://byzantine-2yy.pages.dev

> Built on a fork of [e-desktop/stjohnoftheladder](https://stjohnoftheladder.github.io) (Phaser game + multiplayer infrastructure), paired with the parish's existing meet platform. The MVP is intentionally small: identity and RSVP live in `localStorage`; no accounts, no backend signup.

## Stack

- **Frontend:** TypeScript + Vite + Phaser 4 (pixel-art hub), static PWA
- **Multiplayer:** Cloudflare Workers + Durable Objects (presence, waves, video invites, fellowship points in DO SQLite)
- **Video:** Daily.co (embedded call overlay, 90-second conversations)
- **Hosting:** Cloudflare Pages (frontend) + Cloudflare Workers (multiplayer)

## Run locally

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # type-check + production build (dist/)
npm test           # Playwright + axe-core suite (61 checks, device emulation incl.)
```

## Deploy

```bash
# Frontend (Cloudflare Pages, project "byzantine")
npx wrangler pages deploy dist --project-name=byzantine --branch=main

# Multiplayer worker (from multiplayer-worker/)
npx wrangler deploy
npx wrangler secret put DAILY_API_KEY
npx wrangler secret put DAILY_SUBDOMAIN
```

See `HANDOFF.md` for the full architecture, points system, and deployment notes.

## License

MIT — see `LICENSE`.
