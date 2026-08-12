/**
 * Hub art drop-in slots.
 *
 * Corey's art goes in `src/hub-art/` with these exact filenames. Vite resolves
 * them at BUILD time — drop the file in, rebuild (auto-deploy does it), and the
 * hub uses it automatically, replacing the procedural placeholder. No code
 * changes needed. Missing files simply fall back to the placeholders.
 *
 *   hub-world.png        — full portrait world background (480×854 or larger)
 *   hub-floor-tile.png   — seamless floor tile (square, e.g. 64×64)
 *   hub-candle.png       — single-frame candle sprite (small, e.g. 16×24)
 *
 * IMPORTANT: build-time detection means the file must exist when `npm run
 * build` / CI runs. A file added to src/hub-art/ but never committed does not
 * get deployed.
 */
const slots = import.meta.glob('/src/hub-art/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface HubArtSlots {
  /** Full portrait world background. */
  world?: string;
  /** Seamless floor tile texture. */
  floor?: string;
  /** Single-frame candle sprite. */
  candle?: string;
}

export function getHubArtSlots(): HubArtSlots {
  const out: HubArtSlots = {};
  const world = slots['/src/hub-art/hub-world.png'];
  const floor = slots['/src/hub-art/hub-floor-tile.png'];
  const candle = slots['/src/hub-art/hub-candle.png'];
  if (world) out.world = world;
  if (floor) out.floor = floor;
  if (candle) out.candle = candle;
  return out;
}
