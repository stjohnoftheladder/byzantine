/**
 * Fellowship Go — screen controller
 * Handles transitions between FG screens, RSVP, and attendee list.
 */

// ---- Config ----

const PARISH = {
  name: 'Ss. George & Alexandra',
  location: 'Fort Smith, Arkansas',
  meetDate: 'Friday, August 28',
  meetTime: '7:30 PM',
};

// ---- DOM refs ----

const fgWelcome = document.getElementById('fg-welcome')!;
const fgParishCard = document.getElementById('fg-parish-card')!;
const fgMyParish = document.getElementById('fg-my-parish')!;
const fgFellowship = document.getElementById('fg-fellowship')!;
const fgNav = document.getElementById('fg-nav')!;
const fgFeedback = document.getElementById('fg-feedback')!;
const fgNameDialog = document.getElementById('fg-name-dialog') as HTMLDialogElement | null;
const fgNameForm = document.getElementById('fg-name-form') as HTMLFormElement | null;
const fgNameInput = document.getElementById('fg-name-input') as HTMLInputElement | null;
const fgNameCancel = document.getElementById('fg-name-cancel') as HTMLButtonElement | null;

// ---- State ----

const RSVP_KEY = 'fg-rsvp-v1';
const FEEDBACK_KEY = 'fg-feedback-v1';
const ATTENDEES_KEY = 'fg-attendees-v1';

// ---- Public API ----

export function showFellowshipGo(): void {
  const hasJoined = localStorage.getItem(RSVP_KEY) === 'true';
  const hasFeedback = localStorage.getItem(FEEDBACK_KEY) === 'true';

  if (hasJoined) {
    showScreen(fgMyParish);
    updateRsvpButton();
    loadAttendees();
    fgNav.hidden = false;

    // Show post-meet feedback if meet has passed and no feedback yet
    if (isAfterMeet() && !hasFeedback) {
      fgFeedback.hidden = false;
    }
  } else {
    showScreen(fgWelcome);
    fgNav.hidden = true;
  }
}

export function hideFellowshipGo(): void {
  fgWelcome.hidden = true;
  fgParishCard.hidden = true;
  fgMyParish.hidden = true;
  fgFellowship.hidden = true;
  fgNav.hidden = true;
  fgFeedback.hidden = true;
}

export function getRsvpName(): string {
  return localStorage.getItem('fg-rsvp-name') || '';
}

// ---- Screen transitions ----

function showScreen(screen: HTMLElement): void {
  fgWelcome.hidden = true;
  fgParishCard.hidden = true;
  fgMyParish.hidden = true;
  fgFellowship.hidden = true;
  screen.hidden = false;

  // Update nav active state
  for (const btn of fgNav.querySelectorAll<HTMLButtonElement>('.fg-nav-btn')) {
    const target = btn.dataset.screen;
    btn.classList.toggle('fg-nav-active', target === screen.id);
  }
}

function showMyParish(): void {
  showScreen(fgMyParish);
  fgNav.hidden = false;
  updateRsvpButton();
  loadAttendees();
}

// ---- RSVP ----

function updateRsvpButton(): void {
  const btn = document.getElementById('fg-rsvp-btn') as HTMLButtonElement;
  if (!btn) return;
  const hasRsvp = localStorage.getItem(RSVP_KEY) === 'true';
  if (hasRsvp) {
    btn.textContent = "You're coming!";
    btn.classList.remove('fg-btn-primary');
    btn.classList.add('fg-btn--coming');
    btn.disabled = true;
  }
}

function rsvp(): void {
  const name = localStorage.getItem('fg-rsvp-name');
  const displayName = name || 'A parishioner';
  localStorage.setItem(RSVP_KEY, 'true');

  // Add to local attendee list
  const attendees = getAttendees();
  if (!attendees.includes(displayName)) {
    attendees.push(displayName);
    saveAttendees(attendees);
  }
  updateRsvpButton();
  loadAttendees();
}

// ---- Attendees (localStorage for pilot) ----

function getAttendees(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ATTENDEES_KEY) || '[]') as string[];
  } catch { return []; }
}

function saveAttendees(attendees: string[]): void {
  localStorage.setItem(ATTENDEES_KEY, JSON.stringify(attendees));
}

function loadAttendees(): void {
  const list = document.getElementById('fg-attendee-list');
  if (!list) return;
  const attendees = getAttendees();
  if (attendees.length === 0) {
    list.innerHTML = '<p class="fg-text-dim">Be the first to say "I\'m coming!"</p>';
    return;
  }
  list.innerHTML = attendees.map((name) =>
    `<div class="fg-attendee-item"><span class="fg-avatar" role="img" aria-label="avatar"></span> ${escapeHtml(name)}</div>`
  ).join('');
}

// ---- Fellowship list ----

function loadFellowship(): void {
  const list = document.getElementById('fg-fellowship-list');
  if (!list) return;
  // For pilot, show data from Byzantine's localStorage connections if available
  const connections = getConnections();
  if (connections.length === 0) {
    list.innerHTML = '<p class="fg-text-dim">No connections yet. Join a parish meet or visit the Hub to meet someone.</p>';
    return;
  }
  list.innerHTML = connections.map((c) =>
    `<div class="fg-fellowship-entry">
      <div class="fg-fellowship-name">${escapeHtml(c.name)}</div>
      <div class="fg-fellowship-parish">${escapeHtml(c.parish || PARISH.name)}</div>
      <div class="fg-fellowship-activity">${escapeHtml(c.activity)}</div>
    </div>`
  ).join('');
}

interface Connection { name: string; parish?: string; activity: string; }

function getConnections(): Connection[] {
  try {
    return JSON.parse(localStorage.getItem('fg-connections') || '[]') as Connection[];
  } catch { return []; }
}

/**
 * Record a parishioner we met (called when a video conversation starts).
 * De-dupes by name — a peer is recorded once. Persisted to fg-connections.
 */
export function recordConnection(peerName: string, activity: string): void {
  if (!peerName) return;
  try {
    const connections = getConnections();
    if (connections.some((c) => c.name === peerName)) return;
    connections.push({ name: peerName, parish: PARISH.name, activity });
    localStorage.setItem('fg-connections', JSON.stringify(connections));
  } catch { /* storage unavailable — never break the conversation */ }
}

// ---- Feedback ----

function isAfterMeet(): boolean {
  // Aug 28, 2026 7:30 PM America/Chicago = 2026-08-29T00:30:00Z
  const meetEnd = new Date('2026-08-29T00:30:00Z').getTime();
  return Date.now() > meetEnd;
}

function submitFeedback(rating: string): void {
  localStorage.setItem(FEEDBACK_KEY, rating);
  fgFeedback.hidden = true;
  // Store for later analytics
  const feedbacks = JSON.parse(localStorage.getItem('fg-feedbacks') || '[]') as string[];
  feedbacks.push(rating);
  localStorage.setItem('fg-feedbacks', JSON.stringify(feedbacks));
}

// ---- Helpers ----

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---- Wire DOM events ----

export function initFellowshipGo(): void {
  // FG Welcome
  document.getElementById('fg-join-btn')?.addEventListener('click', () => { void completeJoin(); });

  document.getElementById('fg-explore-btn')?.addEventListener('click', () => {
    showScreen(fgParishCard);
  });

  // Parish card
  document.getElementById('fg-card-back')?.addEventListener('click', () => {
    showScreen(fgWelcome);
  });

  document.getElementById('fg-card-join-btn')?.addEventListener('click', () => { void completeJoin(); });

  // My Parish
  document.getElementById('fg-rsvp-btn')?.addEventListener('click', () => {
    rsvp();
  });

  // Bottom nav
  fgNav.querySelectorAll<HTMLButtonElement>('.fg-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const screenId = btn.dataset.screen;
      const screen = document.getElementById(screenId || '');
      if (!screen) return;
      if (screen === fgFellowship) loadFellowship();
      showScreen(screen);
    });
  });

  // First-name dialog
  fgNameForm?.addEventListener('submit', () => {
    finishNameEntry(fgNameInput?.value.trim().slice(0, 16) || null);
  });
  fgNameCancel?.addEventListener('click', () => {
    finishNameEntry(null);
  });
  fgNameDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    finishNameEntry(null);
  });

  // Feedback prompt
  document.querySelectorAll<HTMLButtonElement>('.fg-emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      submitFeedback(btn.dataset.rating || 'unknown');
    });
  });
  document.getElementById('fg-feedback-skip')?.addEventListener('click', () => {
    localStorage.setItem(FEEDBACK_KEY, 'skipped');
    fgFeedback.hidden = true;
  });

  // Enter Hub button (handled in main.ts)
}

/**
 * Shared join path for both entry points ("Join my parish" and the parish
 * card button). Uses the Byzantine identity when available, otherwise asks
 * for a first name in the styled dialog. Cancelling the dialog aborts.
 */
async function completeJoin(): Promise<void> {
  const save = readByzantineSave();
  let name = save?.name || '';
  if (!name) {
    name = (await requestName()) || '';
    if (!name) return; // user cancelled
  }
  localStorage.setItem('fg-rsvp-name', name.trim().slice(0, 16));
  rsvp();
  showMyParish();
}

let nameResolver: ((name: string | null) => void) | null = null;

/** Open the styled name dialog and resolve with the entered name (or null). */
function requestName(): Promise<string | null> {
  return new Promise((resolve) => {
    // Defensive: a second request while one is pending aborts the first
    if (nameResolver) {
      const stale = nameResolver;
      nameResolver = null;
      stale(null);
    }
    nameResolver = resolve;
    if (fgNameInput) {
      fgNameInput.value = '';
      fgNameInput.removeAttribute('disabled');
    }
    if (fgNameDialog && !fgNameDialog.open) fgNameDialog.showModal();
    if (fgNameInput) fgNameInput.focus();
  });
}

function finishNameEntry(name: string | null): void {
  if (fgNameDialog?.open) fgNameDialog.close();
  const resolve = nameResolver;
  nameResolver = null;
  resolve?.(name);
}

// ---- Read Byzantine identity ----

function readByzantineSave(): { name: string; playerId: string } | null {
  try {
    const raw = JSON.parse(localStorage.getItem('byzantine-save-v1') || 'null');
    if (raw?.name && raw?.playerId) return { name: raw.name, playerId: raw.playerId };
    return null;
  } catch { return null; }
}
