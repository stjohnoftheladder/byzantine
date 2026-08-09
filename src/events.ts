import Phaser from 'phaser';

export const gameEvents = new Phaser.Events.EventEmitter();

export const EVENT_MULTIPLAYER_STATUS = 'multiplayer-status';
export const EVENT_MULTIPLAYER_PRESENCE = 'multiplayer-presence';
export const EVENT_MULTIPLAYER_SYSTEM = 'multiplayer-system';
export const EVENT_MULTIPLAYER_VIDEO = 'multiplayer-video';
export const EVENT_MULTIPLAYER_VIDEO_ACTION = 'multiplayer-video-action';
export const EVENT_CONVERSATION_PAUSE = 'conversation-pause';
export const EVENT_SAVE = 'save';
export const EVENT_POINTS_UPDATED = 'points-updated';
export const EVENT_SHOW_TOAST = 'show-toast';
