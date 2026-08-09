import type { ByzantineSave } from './types';

const SAVE_KEY = 'byzantine-save-v1';

export const defaultSave = (name: string, playerId: string): ByzantineSave => ({
  playerId,
  name,
  homeParish: 'Ss. George & Alexandria',
  points: 0,
  playerX: 240,
  playerY: 600,
});

export const readSave = (): ByzantineSave | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Partial<ByzantineSave> | null;
    if (!raw?.playerId || !raw?.name) return null;
    return { ...defaultSave(raw.name, raw.playerId), ...raw };
  } catch {
    return null;
  }
};

export const writeSave = (save: ByzantineSave): void => {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
};

export const clearSave = (): void => {
  localStorage.removeItem(SAVE_KEY);
};

export const STORAGE_KEY = SAVE_KEY;
