/**
 * Fellowship Go — automated testing per fellowship-go-testing-plan.md
 *
 * Flows: fresh visitor → welcome; Join my parish → My Parish; Explore first →
 * parish card → join; RSVP state; Fellowship list; Enter the Hub.
 * Run at mobile + desktop viewports. Screenshots saved as _test-*.png.
 * Accessibility (axe-core) run on each key screen.
 *
 * Usage: node fg-tests.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.argv[2] || 'https://byzantine-2yy.pages.dev';
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2 };
const DESKTOP = { width: 1280, height: 800 };

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function newContext(browser, viewport, seed) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.deviceScaleFactor ?? 1, isMobile: viewport.width < 500 });
  // Seed localStorage BEFORE any page script runs, on first load only (reloads keep real state)
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('__fg_seeded')) return;
    localStorage.clear();
    if (s) {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    }
    sessionStorage.setItem('__fg_seeded', '1');
  }, seed || null);
  return ctx;
}

async function runAxe(page, label) {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      rules: { 'color-contrast': { enabled: true }, 'region': { enabled: false } },
    });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  });
  const serious = results.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  if (serious.length === 0) {
    check(`axe: ${label} (${results.length} total violations, 0 serious)`, true);
    for (const v of results) console.log(`        minor: ${v.id} (${v.nodes} nodes) — ${v.help}`);
  } else {
    check(`axe: ${label}`, false, JSON.stringify(serious));
  }
  return results;
}

/** Complete the join flow by filling the styled first-name dialog. */
async function joinWithName(page, name) {
  await page.waitForSelector('#fg-name-dialog[open]', { timeout: 5000 });
  await page.fill('#fg-name-input', name);
  await page.click('#fg-name-form button[type=submit]');
}

const browser = await chromium.launch({ headless: true });

// ============ MOBILE ============
console.log('\n== MOBILE (390×844) ==\n');

// Flow A — fresh visitor sees welcome
{
  const ctx = await newContext(browser, MOBILE, null);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-welcome:not([hidden])', { timeout: 15000 });
  check('A1: welcome screen visible for fresh visitor', true);
  const welcomeText = await page.locator('#fg-welcome').innerText();
  check('A2: parish name shown on welcome', welcomeText.includes('Ss. George'), welcomeText.slice(0, 80));
  check('A3: two buttons present', await page.locator('#fg-join-btn').isVisible() && await page.locator('#fg-explore-btn').isVisible());
  await page.screenshot({ path: '_test-01-welcome-mobile.png' });
  await runAxe(page, 'welcome');
  await ctx.close();
}

// Flow B — Join my parish → styled name dialog → My Parish
{
  const ctx = await newContext(browser, MOBILE, null);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-join-btn', { timeout: 15000 });
  await page.click('#fg-join-btn');
  await page.waitForSelector('#fg-name-dialog[open]', { timeout: 5000 });
  check('B0: styled name dialog opens (no native prompt)', true);
  await joinWithName(page, 'Alice');
  await page.waitForSelector('#fg-my-parish:not([hidden])', { timeout: 10000 });
  check('B1: My Parish shown after Join', true);
  const rsvpBtn = page.locator('#fg-rsvp-btn');
  const rsvpText = await rsvpBtn.innerText();
  check('B2: RSVP button shows "You\'re coming!"', rsvpText.includes('coming'), rsvpText);
  check('B3: RSVP button disabled after join', await rsvpBtn.isDisabled());
  const attendees = await page.locator('#fg-attendee-list').innerText();
  check('B4: attendee list contains Alice', attendees.includes('Alice'), attendees.slice(0, 60));
  const parishText = await page.locator('#fg-my-parish').innerText();
  check('B5: meet date shown on My Parish', parishText.includes('August 28') && parishText.includes('7:30'), parishText.slice(0, 120));
  check('B6: bottom nav visible', await page.locator('#fg-nav').isVisible());
  await page.screenshot({ path: '_test-02-my-parish-mobile.png' });
  await runAxe(page, 'my-parish');
  await ctx.close();
}

// Flow C — Explore first → parish card → back → join (via dialog)
{
  const ctx = await newContext(browser, MOBILE, null);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-explore-btn', { timeout: 15000 });
  await page.click('#fg-explore-btn');
  await page.waitForSelector('#fg-parish-card:not([hidden])', { timeout: 10000 });
  check('C1: parish card shown after Explore first', true);
  const cardText = await page.locator('#fg-parish-card').innerText();
  check('C2: meet info on parish card', cardText.includes('August 28') && cardText.includes('Fort Smith'), cardText.slice(0, 100));
  await page.screenshot({ path: '_test-03-parish-card-mobile.png' });
  await runAxe(page, 'parish-card');
  await page.click('#fg-card-back');
  await page.waitForSelector('#fg-welcome:not([hidden])', { timeout: 5000 });
  check('C3: back returns to welcome', true);
  await page.click('#fg-explore-btn');
  await page.waitForSelector('#fg-parish-card:not([hidden])', { timeout: 5000 });
  await page.click('#fg-card-join-btn');
  await joinWithName(page, 'Bob');
  await page.waitForSelector('#fg-my-parish:not([hidden])', { timeout: 10000 });
  check('C4: join from parish card works (styled dialog)', true);
  await ctx.close();
}

// Flow C2 — cancel path: "Not now" aborts join, stays on welcome
{
  const ctx = await newContext(browser, MOBILE, null);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-join-btn', { timeout: 15000 });
  await page.click('#fg-join-btn');
  await page.waitForSelector('#fg-name-dialog[open]', { timeout: 5000 });
  await page.click('#fg-name-cancel');
  await page.waitForSelector('#fg-welcome:not([hidden])', { timeout: 5000 });
  check('C5: cancel returns to welcome', true);
  const stillFresh = await page.evaluate(() => localStorage.getItem('fg-rsvp-v1'));
  check('C6: no RSVP recorded after cancel', stillFresh === null, `rsvp=${stillFresh}`);
  await ctx.close();
}

// Flow C3 — returning parishioner with saved identity skips the name dialog
{
  const seed = {
    'byzantine-save-v1': JSON.stringify({ name: 'David', playerId: 'p-123', points: 0, playerX: 240, playerY: 600 }),
  };
  const ctx = await newContext(browser, MOBILE, seed);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-join-btn', { timeout: 15000 });
  await page.click('#fg-join-btn');
  await page.waitForSelector('#fg-my-parish:not([hidden])', { timeout: 10000 });
  const dialogOpened = await page.evaluate(() => document.getElementById('fg-name-dialog')?.open ?? false);
  check('C7: saved identity skips name dialog', !dialogOpened);
  const attendeeText = await page.locator('#fg-attendee-list').innerText();
  check('C8: saved name used as attendee', attendeeText.includes('David'), attendeeText.slice(0, 60));
  await ctx.close();
}

// Flow D — Fellowship list with seeded connections
{
  const seed = {
    'fg-rsvp-v1': 'true',
    'fg-rsvp-name': 'Alice',
    'fg-connections': JSON.stringify([
      { name: 'James', parish: 'Ss. George & Alexandra', activity: 'Met at parish meet' },
      { name: 'Sarah', parish: 'St. John the Baptist', activity: 'Waved in the Hub' },
    ]),
  };
  const ctx = await newContext(browser, MOBILE, seed);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-my-parish:not([hidden])', { timeout: 15000 });
  await page.click('.fg-nav-btn[data-screen="fg-fellowship"]');
  await page.waitForSelector('#fg-fellowship:not([hidden])', { timeout: 5000 });
  const fl = await page.locator('#fg-fellowship-list').innerText();
  check('D1: fellowship list shows connections', fl.includes('James') && fl.includes('Sarah'), fl.slice(0, 80));
  check('D2: empty state absent when connections exist', !fl.includes('No connections yet'));
  await page.screenshot({ path: '_test-04-fellowship-mobile.png' });
  await runAxe(page, 'fellowship');
  await ctx.close();
}

// Flow E — Enter the Hub (Phaser)
{
  const seed = { 'fg-rsvp-v1': 'true', 'fg-rsvp-name': 'Alice' };
  const ctx = await newContext(browser, MOBILE, seed);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-enter-hub-btn', { timeout: 15000 });
  await page.click('#fg-enter-hub-btn');
  await page.waitForSelector('#game-view:not([hidden])', { timeout: 10000 });
  const canvas = await page.waitForSelector('#game-container canvas', { timeout: 15000 });
  check('E1: hub canvas mounted', !!canvas);
  await page.waitForTimeout(2500); // let scenes boot + assets load
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.screenshot({ path: '_test-05-hub-mobile.png' });
  const fatal = consoleErrors.filter((e) => !e.includes('WebGL') && !e.includes('favicon'));
  check('E2: no fatal console errors in hub', fatal.length === 0, fatal.slice(0, 2).join(' | '));
  await ctx.close();
}

// ============ DEVICE EMULATION (per real-device checklist) ============
console.log('\n== DEVICE EMULATION (iPhone / Android / tablet) ==\n');

async function newDeviceContext(browser, deviceName, seed) {
  const descriptor = devices[deviceName];
  if (!descriptor) throw new Error(`Unknown device: ${deviceName}`);
  const ctx = await browser.newContext({ ...descriptor });
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('__fg_seeded')) return;
    localStorage.clear();
    if (s) {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    }
    sessionStorage.setItem('__fg_seeded', '1');
  }, seed || null);
  return ctx;
}

const DEVICE_NAMES = ['iPhone 13', 'Pixel 7', 'iPad (gen 7)'];

for (const deviceName of DEVICE_NAMES) {
  const ctx = await newDeviceContext(browser, deviceName, null);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-welcome:not([hidden])', { timeout: 15000 });
  check(`${deviceName}: welcome renders`, true);

  // Tap target: primary join button ≥ 44px
  const joinBox = await page.locator('#fg-join-btn').boundingBox();
  check(`${deviceName}: join button ≥44px tall`, joinBox && joinBox.height >= 44, joinBox ? `${Math.round(joinBox.height)}px` : 'no box');
  check(`${deviceName}: join button ≥44px wide`, joinBox && joinBox.width >= 44, joinBox ? `${Math.round(joinBox.width)}px` : 'no box');

  // No horizontal overflow on welcome
  const overWelcome = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${deviceName}: no horizontal overflow (welcome)`, overWelcome <= 0, `${overWelcome}px`);

  // Join flow through the styled dialog
  await page.click('#fg-join-btn');
  await page.waitForSelector('#fg-name-dialog[open]', { timeout: 5000 });
  await page.fill('#fg-name-input', 'Ruth');
  await page.click('#fg-name-form button[type=submit]');
  await page.waitForSelector('#fg-my-parish:not([hidden])', { timeout: 10000 });
  check(`${deviceName}: join flow completes`, true);

  // Meet date easy to find
  const parishText = await page.locator('#fg-my-parish').innerText();
  check(`${deviceName}: meet date visible on My Parish`, parishText.includes('August 28') && parishText.includes('7:30'), parishText.slice(0, 80));

  // No horizontal overflow on My Parish
  const overParish = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${deviceName}: no horizontal overflow (my-parish)`, overParish <= 0, `${overParish}px`);

  // RSVP button tap target
  const rsvpBox = await page.locator('#fg-rsvp-btn').boundingBox();
  check(`${deviceName}: RSVP button ≥44px tall`, rsvpBox && rsvpBox.height >= 44, rsvpBox ? `${Math.round(rsvpBox.height)}px` : 'no box');

  // State preservation on return (reload)
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-my-parish:not([hidden])', { timeout: 15000 });
  const rsvpAfter = await page.locator('#fg-rsvp-btn').innerText();
  check(`${deviceName}: reload keeps My Parish + RSVP`, rsvpAfter.includes('coming'), rsvpAfter);
  const attendeesAfter = await page.locator('#fg-attendee-list').innerText();
  check(`${deviceName}: attendee persists after reload`, attendeesAfter.includes('Ruth'), attendeesAfter.slice(0, 60));

  await ctx.close();
}

// Hub entry on iPhone emulation (covers video/Hub entry on mobile)
{
  const seed = { 'fg-rsvp-v1': 'true', 'fg-rsvp-name': 'Ruth' };
  const ctx = await newDeviceContext(browser, 'iPhone 13', seed);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-enter-hub-btn', { timeout: 15000 });
  await page.click('#fg-enter-hub-btn');
  await page.waitForSelector('#game-container canvas', { timeout: 15000 });
  check('iPhone 13: hub canvas mounts', true);
  await page.waitForTimeout(2000);
  await ctx.close();
}

// Zoom enabled (pinch-zoom meta)
{
  const ctx = await newContext(browser, MOBILE, null);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  const meta = await page.evaluate(() => document.querySelector('meta[name=viewport]')?.getAttribute('content') || '');
  check('pinch-zoom enabled (no user-scalable=no)', !meta.includes('user-scalable=no') && !meta.includes('maximum-scale=1'), meta);
  await ctx.close();
}

// ============ DESKTOP ============
console.log('\n== DESKTOP (1280×800) ==\n');

{
  const ctx = await newContext(browser, DESKTOP, null);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#fg-welcome:not([hidden])', { timeout: 15000 });
  check('F1: welcome renders at desktop', true);
  await page.screenshot({ path: '_test-06-welcome-desktop.png' });
  await page.click('#fg-join-btn');
  await joinWithName(page, 'Carol');
  await page.waitForSelector('#fg-my-parish:not([hidden])', { timeout: 10000 });
  check('F2: join flow works at desktop', true);
  const attendeeText = await page.locator('#fg-attendee-list').innerText();
  check('F3: attendee added at desktop', attendeeText.includes('Carol'));
  await page.screenshot({ path: '_test-07-my-parish-desktop.png' });
  await ctx.close();
}

await browser.close();

console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
