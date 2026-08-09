export interface Teaching {
  number: number;
  title: string;
  description: string;
  whispers: string[];
}

export interface ByzantineSave {
  playerId: string;
  name: string;
  homeParish: string;
  points: number;
  playerX: number;
  playerY: number;
}

export interface SaveData {
  name: string;
  unlocked: number;
  health: number;
  eggs: number;
  hasRope: boolean;
  muted: boolean;
  playerX: number;
  playerY: number;
}

export interface GameStats {
  unlocked: number;
  health: number;
  eggs: number;
}
