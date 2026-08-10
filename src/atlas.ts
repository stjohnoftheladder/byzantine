// AUTO-GENERATED from the original Construct 2 data.js. Do not hand-edit.
// Frame rectangles are the exact atlas coordinates from the 2025 original.

export interface FrameRect { sheet: string; x: number; y: number; w: number; h: number; ox: number; oy: number; }
export interface AnimDef { key: string; frameRate: number; repeat: number; frames: FrameRect[]; }

export const PEER_ANIMS: AnimDef[] = [
  { key: 'peer-w_Angle1', frameRate: 5, repeat: -1, frames: [
    { sheet: 'os_peer-sheet2', x: 1, y: 1, w: 32, h: 48, ox: 0.5938, oy: 0.6667 },
    { sheet: 'os_peer-sheet2', x: 69, y: 1, w: 30, h: 50, ox: 0.6, oy: 0.66 },
    { sheet: 'os_peer-sheet2', x: 35, y: 1, w: 32, h: 48, ox: 0.5938, oy: 0.6667 },
    { sheet: 'os_peer-sheet1', x: 79, y: 51, w: 34, h: 50, ox: 0.6176, oy: 0.66 },
  ] },
  { key: 'peer-w_Angle2', frameRate: 5, repeat: -1, frames: [
    { sheet: 'os_peer-sheet0', x: 83, y: 1, w: 40, h: 52, ox: 0.475, oy: 0.6923 },
    { sheet: 'os_peer-sheet0', x: 1, y: 1, w: 39, h: 57, ox: 0.4872, oy: 0.6842 },
    { sheet: 'os_peer-sheet0', x: 83, y: 55, w: 39, h: 53, ox: 0.4872, oy: 0.6981 },
    { sheet: 'os_peer-sheet0', x: 42, y: 1, w: 39, h: 56, ox: 0.4872, oy: 0.6786 },
  ] },
  { key: 'peer-w_Angle3', frameRate: 5, repeat: -1, frames: [
    { sheet: 'os_peer-sheet1', x: 1, y: 55, w: 32, h: 50, ox: 0.5312, oy: 0.66 },
    { sheet: 'os_peer-sheet0', x: 1, y: 60, w: 40, h: 50, ox: 0.525, oy: 0.66 },
    { sheet: 'os_peer-sheet1', x: 41, y: 51, w: 36, h: 48, ox: 0.5278, oy: 0.6667 },
    { sheet: 'os_peer-sheet1', x: 41, y: 51, w: 36, h: 48, ox: 0.5278, oy: 0.6667 },
  ] },
  { key: 'peer-w_Angle4', frameRate: 5, repeat: -1, frames: [
    { sheet: 'os_peer-sheet1', x: 41, y: 1, w: 38, h: 48, ox: 0.5789, oy: 0.6042 },
    { sheet: 'os_peer-sheet0', x: 43, y: 59, w: 38, h: 52, ox: 0.5526, oy: 0.5769 },
    { sheet: 'os_peer-sheet1', x: 81, y: 1, w: 38, h: 48, ox: 0.5263, oy: 0.6042 },
    { sheet: 'os_peer-sheet1', x: 1, y: 1, w: 38, h: 52, ox: 0.5, oy: 0.5769 },
  ] },
];

export const REQUIRED_SHEETS: string[] = [
  'os_peer-sheet0',
  'os_peer-sheet1',
  'os_peer-sheet2',
];
