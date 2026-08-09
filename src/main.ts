import Phaser from 'phaser';
import './style.css';
import {
  EVENT_CONVERSATION_PAUSE,
  EVENT_MULTIPLAYER_PRESENCE,
  EVENT_MULTIPLAYER_STATUS,
  EVENT_MULTIPLAYER_VIDEO,
  EVENT_MULTIPLAYER_VIDEO_ACTION,
  EVENT_POINTS_UPDATED,
  EVENT_SHOW_TOAST,
  gameEvents,
} from './events';
import { HubScene } from './HubScene';
import { LadderScene } from './LadderScene';
import type { ByzantineSave } from './types';
import { clearSave, defaultSave, readSave, writeSave } from './save';
import type {
  PeerPresence,
  VideoCredentials,
  VideoInvite,
  VideoServerMessage,
  VideoClientMessage,
} from './multiplayer/MultiplayerClient';
import { DailyConversation } from './video/DailyConversation';

// ---- DOM helpers ----

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
};

// ---- State ----

const welcome = byId('welcome');
const gameView = byId('game-view');
const pilgrimForm = byId<HTMLFormElement>('pilgrim-form');
const pilgrimName = byId<HTMLInputElement>('pilgrim-name');

const playerCard = byId('player-card');
const cardClose = byId('card-close');
const cardName = byId('card-name');
const cardParish = byId('card-parish');
const cardWave = byId('card-wave');

const videoInviteDialog = byId<HTMLDialogElement>('video-invite-dialog');
const videoInviteTitle = byId('video-invite-title');
const videoInviteCopy = byId('video-invite-copy');
const videoAccept = byId('video-accept');
const videoDecline = byId('video-decline');

const videoConversation = byId('video-conversation');
const videoTitle = byId('video-title');
const videoStatus = byId('video-status');
const videoTimer = byId<HTMLOutputElement>('video-timer');
const videoStage = byId('video-stage');
const videoReady = byId('video-ready');
const videoReadyCopy = byId('video-ready-copy');
const videoJoin = byId<HTMLButtonElement>('video-join');
const videoCancel = byId<HTMLButtonElement>('video-cancel');
const videoLeave = byId<HTMLButtonElement>('video-leave');
const videoFooter = byId('video-footer');

const pointsValue = byId('points-value');
const toast = byId('toast');

const hostControls = byId('host-controls');
const grantParishMeetBtn = byId<HTMLButtonElement>('grant-parish-meet-btn');

const dailyConversation = new DailyConversation();

let game: Phaser.Game | null = null;
let hubScene: HubScene | null = null;
let savedAtLaunch = readSave();
console.log('Byzantine: loaded, savedAtLaunch =', !!savedAtLaunch);
let incomingInvite: VideoInvite | null = null;
let conversationTimer: number | undefined;
let conversationJoined = false;
let externalFallbackReady = false;
let activeConversation: {
  credentials: VideoCredentials;
  startedAt?: number;
  endsAt?: number;
} | null = null;
let toastTimer: number | undefined;

// ---- Welcome screen ----
// Returning parishioners auto-join the hub — no "continue" button needed.

const startGame = (save: ByzantineSave): void => {
  console.log('startGame: entering, save=', save.name, save.playerId);
  try {
    welcome.hidden = true;
    gameView.hidden = false;
    document.body.classList.add('is-playing');
    console.log('startGame: welcome hidden, gameView visible');

    const isHost = new URLSearchParams(window.location.search).has('host');
    if (isHost) hostControls.hidden = false;

    game?.destroy(true);
    console.log('startGame: creating Phaser.Game...');
    game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 480,
      height: 854,
      parent: 'game-container',
      transparent: true,
      pixelArt: true,
      roundPixels: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: 'arcade', arcade: { debug: false } },
      scene: [new HubScene(save), new LadderScene()],
      audio: { disableWebAudio: true },
      input: { activePointers: 3 },
    });
    console.log('startGame: Phaser.Game created OK');

    game.events.once('ready', () => {
      console.log('startGame: game ready event fired');
      hubScene = game?.scene.getScene('Hub') as HubScene;
    });
    game.canvas.tabIndex = 0;
    game.canvas.focus({ preventScroll: true });
    game.canvas.addEventListener('pointerdown', () => { game?.canvas.focus({ preventScroll: true }); });
  } catch (e) {
    console.error('startGame failed:', e);
  }
};

const submitName = (): void => {
  try {
    const name = pilgrimName.value.trim().slice(0, 16);
    if (!name) return;
    const playerId = crypto.randomUUID();
    const save = defaultSave(name, playerId);
    writeSave(save);
    void startGame(save);
  } catch (e) {
    console.error('Form submit failed:', e);
  }
};

if (savedAtLaunch) {
  try {
    void startGame(savedAtLaunch);
  } catch {
    // Corrupted save — clear it and show welcome screen
    clearSave();
    savedAtLaunch = null;
  }
} else {
  pilgrimForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitName();
  });
  // Also bind to button click for browsers where form submit behaves oddly
  pilgrimForm.querySelector('button[type="submit"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    submitName();
  });
}

// ---- Player card ----

cardClose.addEventListener('click', () => {
  playerCard.hidden = true;
  if (hubScene) hubScene.setSelectedPeerId(null);
});

cardWave.addEventListener('click', () => {
  const peerId = hubScene?.getSelectedPeerId();
  if (!peerId) return;

  // Find peer name from presence
  sendVideoAction({ type: 'video-invite', peerId, mode: 'video' });
  showToast('Wave sent! Waiting for response...');
  playerCard.hidden = true;
});

// ---- Video invite flow ----

videoAccept.addEventListener('click', (event) => {
  event.preventDefault();
  if (!incomingInvite) return;
  sendVideoAction({ type: 'video-respond', inviteId: incomingInvite.id, accept: true });
  incomingInvite = null;
  videoInviteDialog.close();
});

videoDecline.addEventListener('click', (event) => {
  event.preventDefault();
  declineIncomingInvite();
});

videoInviteDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  declineIncomingInvite();
});

videoJoin.addEventListener('click', () => { void joinConversation(); });
videoCancel.addEventListener('click', () => leaveConversation('left before joining'));
videoLeave.addEventListener('click', () => leaveConversation('left early'));

// Host: grant Parish Meet points to all online players
grantParishMeetBtn.addEventListener('click', () => {
  hubScene?.sendMultiplayerMessage({ type: 'grant_parish_meet_points' });
  showToast('Granting Parish Meet points to everyone in the hub...');
});

// ---- Event listeners ----

gameEvents.on(EVENT_SHOW_TOAST, (message: string) => showToast(message));

gameEvents.on(EVENT_POINTS_UPDATED, (points: number) => {
  pointsValue.textContent = String(points);
});

gameEvents.on(EVENT_MULTIPLAYER_STATUS, (status: string) => {
  if (status === 'offline') {
    showToast('Hub is offline — others may not appear.');
  }
});

gameEvents.on(EVENT_MULTIPLAYER_PRESENCE, (_peers: PeerPresence[]) => {
  // Presence is handled by HubScene for sprite rendering
});

gameEvents.on(EVENT_MULTIPLAYER_VIDEO, (message: VideoServerMessage) => {
  void handleVideoMessage(message);
});

// Handle showing player card from HubScene
gameEvents.on('show-player-card', (peerId: string, peerName: string) => {
  hubScene?.setSelectedPeerId(peerId);
  cardName.textContent = peerName;
  cardParish.textContent = 'Ss. George & Alexandria';
  playerCard.hidden = false;
});

gameEvents.on('hide-player-card', () => {
  playerCard.hidden = true;
  hubScene?.setSelectedPeerId(null);
});

// ---- Video helpers ----

function sendVideoAction(message: VideoClientMessage): void {
  gameEvents.emit(EVENT_MULTIPLAYER_VIDEO_ACTION, message);
}

function declineIncomingInvite(): void {
  if (!incomingInvite) return;
  sendVideoAction({ type: 'video-respond', inviteId: incomingInvite.id, accept: false });
  incomingInvite = null;
  videoInviteDialog.close();
}

async function handleVideoMessage(message: VideoServerMessage): Promise<void> {
  switch (message.type) {
    case 'video-invite': {
      incomingInvite = message.invite;
      videoInviteTitle.textContent = `${message.invite.fromName} is waving at you`;
      videoInviteCopy.textContent = `Accept a 90-second video conversation? Nothing is recorded.`;
      if (!videoInviteDialog.open) videoInviteDialog.showModal();
      break;
    }
    case 'video-invite-sent':
      showToast(`Invitation sent to ${message.peerName}.`);
      break;
    case 'video-invite-resolved':
      if (incomingInvite?.id === message.inviteId) {
        incomingInvite = null;
        if (videoInviteDialog.open) videoInviteDialog.close();
      }
      if (message.outcome !== 'accepted') {
        showToast(message.message);
      }
      break;
    case 'video-ready':
      await prepareConversation(message.credentials);
      break;
    case 'video-start':
      if (!activeConversation || activeConversation.credentials.callId !== message.callId) return;
      activeConversation.startedAt = message.startedAt;
      activeConversation.endsAt = message.endsAt;
      videoStatus.textContent = 'The conversation has begun.';
      startConversationTimer();
      break;
    case 'video-ended':
      if (!activeConversation || !message.callId || activeConversation.credentials.callId === message.callId) {
        await closeConversation(message.message);
      }
      break;
    case 'video-error':
      showToast(message.message);
      break;
    case 'video-report-received':
      showToast(message.message);
      break;
  }
}

async function prepareConversation(credentials: VideoCredentials): Promise<void> {
  if (activeConversation) await closeConversation();
  activeConversation = { credentials };
  conversationJoined = false;
  externalFallbackReady = false;
  videoTitle.textContent = `${credentials.mode === 'audio' ? 'Audio' : 'Video'} with ${credentials.peerName}`;
  videoTimer.value = '1:30';
  videoReady.hidden = true;
  videoJoin.hidden = true;
  videoStage.hidden = false;
  videoFooter.hidden = true;
  videoStatus.textContent = 'Connecting...';
  videoConversation.hidden = false;
  gameEvents.emit(EVENT_CONVERSATION_PAUSE, true);

  // Auto-join — no extra "Join" button. Consent already given by accepting the invite.
  await joinConversation();
}

async function joinConversation(): Promise<void> {
  const current = activeConversation;
  if (!current || conversationJoined) return;

  const callbacks = {
    onJoined: () => {
      if (conversationJoined || activeConversation?.credentials.callId !== current.credentials.callId) return;
      conversationJoined = true;
      sendVideoAction({ type: 'video-joined', callId: current.credentials.callId });
      videoStatus.textContent = 'Waiting for the other person...';
      videoFooter.hidden = false;
    },
    onLeft: () => leaveConversation('left early'),
    onPeerLeft: () => leaveConversation('the other person left'),
    onError: (msg: string) => {
      showToast(msg);
      leaveConversation('video error');
    },
  };

  if (externalFallbackReady) {
    if (!dailyConversation.openExternal(current.credentials, callbacks)) return;
    current.credentials.token = '';
    return;
  }

  videoStatus.textContent = 'Checking camera and microphone...';

  try {
    const placement = await dailyConversation.join(videoStage, current.credentials, callbacks);
    if (activeConversation?.credentials.callId !== current.credentials.callId) return;
    if (placement === 'external-needed') {
      externalFallbackReady = true;
      videoStage.hidden = true;
      videoReady.hidden = false;
      videoReadyCopy.textContent = 'This browser needs a separate tab.';
      videoJoin.hidden = false;
      videoJoin.disabled = false;
      videoJoin.textContent = 'Open video tab';
    } else {
      current.credentials.token = '';
    }
  } catch {
    await closeConversation('The video window could not be opened.');
  }
}

function startConversationTimer(): void {
  if (conversationTimer !== undefined) window.clearInterval(conversationTimer);
  renderConversationTimer();
  conversationTimer = window.setInterval(renderConversationTimer, 250);
}

function renderConversationTimer(): void {
  const endsAt = activeConversation?.endsAt;
  if (!endsAt) return;
  const remaining = Math.max(0, endsAt - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  videoTimer.value = `${minutes}:${String(seconds).padStart(2, '0')}`;
  if (remaining === 0) {
    if (conversationTimer !== undefined) window.clearInterval(conversationTimer);
    conversationTimer = undefined;
    videoStatus.textContent = 'Time complete. Returning to the hub...';
    void dailyConversation.dispose();
    videoStage.hidden = true;
  }
}

function leaveConversation(reason: string): void {
  const callId = activeConversation?.credentials.callId;
  if (callId) sendVideoAction({ type: 'video-leave', callId });
  void closeConversation(reason === 'left early' ? 'You left the conversation.' : undefined);
}

async function closeConversation(message?: string): Promise<void> {
  if (conversationTimer !== undefined) window.clearInterval(conversationTimer);
  conversationTimer = undefined;
  await dailyConversation.dispose();
  activeConversation = null;
  conversationJoined = false;
  externalFallbackReady = false;
  videoConversation.hidden = true;
  videoStage.replaceChildren();
  videoStage.hidden = true;
  videoReady.hidden = false;
  videoJoin.hidden = false;
  videoCancel.textContent = 'Leave before joining';
  videoFooter.hidden = true;
  gameEvents.emit(EVENT_CONVERSATION_PAUSE, false);
  if (message) showToast(message);
  game?.canvas.focus({ preventScroll: true });
}

// ---- Toast ----

function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.remove('toast--fade');
  void toast.offsetWidth; // force reflow
  toast.classList.add('toast--fade');

  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

// ---- Cleanup ----

window.addEventListener('pagehide', () => {
  const callId = activeConversation?.credentials.callId;
  if (callId) sendVideoAction({ type: 'video-leave', callId });
  void dailyConversation.dispose();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
