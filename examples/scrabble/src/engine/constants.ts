export const BOARD_SIZE = 15;
export const RACK_SIZE = 7;
export const BINGO_BONUS = 42;
export const ZAP_BONUS_POINTS = 21;
export const CENTER_POSITION = { x: 7, y: 7 };

// Letter point values (Words With Zaps)
export const LETTER_VALUES: Record<string, number> = {
  A: 1,
  B: 4,
  C: 4,
  D: 2,
  E: 1,
  F: 5,
  G: 3,
  H: 4,
  I: 1,
  J: 8,
  K: 7,
  L: 2,
  M: 4,
  N: 2,
  O: 1,
  P: 4,
  Q: 10,
  R: 2,
  S: 1,
  T: 1,
  U: 2,
  V: 5,
  W: 5,
  X: 9,
  Y: 4,
  Z: 11,
  BLANK: 0,
};

// Tile distribution (Words With Zaps - 99 tiles total)
export const TILE_DISTRIBUTION: Record<string, number> = {
  A: 9,
  B: 2,
  C: 2,
  D: 3,
  E: 11,
  F: 2,
  G: 2,
  H: 2,
  I: 9,
  J: 1,
  K: 1,
  L: 4,
  M: 2,
  N: 6,
  O: 8,
  P: 2,
  Q: 1,
  R: 5,
  S: 4,
  T: 6,
  U: 5,
  V: 2,
  W: 2,
  X: 1,
  Y: 2,
  Z: 1,
  BLANK: 4,
};

// Board multiplier types
export type MultiplierType = "DL" | "QL" | "DW" | "ZAP" | null;

// Zap bonus positions (+21 per word, only on newly placed tiles)
// Format: [x, y] where x=column, y=row
const ZAP_BONUS: [number, number][] = [
  [0, 0], // top-left
  [14, 0], // top-right
  [7, 7], // center
  [0, 14], // bottom-left
  [14, 14], // bottom-right
];

// Double Word Score positions
const DOUBLE_WORD: [number, number][] = [
  [7, 1], // row 1
  [2, 2], // row 2
  [12, 2],
  [1, 7], // row 7
  [13, 7],
  [2, 12], // row 12
  [12, 12],
  [7, 13], // row 13
];

// Quadruple Letter Score positions
const QUAD_LETTER: [number, number][] = [
  [4, 0], // row 0
  [10, 0],
  [0, 4], // row 4
  [7, 4],
  [14, 4],
  [4, 7], // row 7
  [10, 7],
  [0, 10], // row 10
  [7, 10],
  [14, 10],
  [4, 14], // row 14
  [10, 14],
];

// Double Letter Score positions
const DOUBLE_LETTER: [number, number][] = [
  [5, 3], // row 3
  [9, 3],
  [3, 5], // row 5
  [11, 5],
  [6, 6], // row 6
  [8, 6],
  [6, 8], // row 8
  [8, 8],
  [3, 9], // row 9
  [11, 9],
  [5, 11], // row 11
  [9, 11],
];

// Build a lookup map for board multipliers
function buildMultiplierMap(): Map<string, MultiplierType> {
  const map = new Map<string, MultiplierType>();

  for (const [x, y] of ZAP_BONUS) {
    map.set(`${x},${y}`, "ZAP");
  }
  for (const [x, y] of DOUBLE_WORD) {
    map.set(`${x},${y}`, "DW");
  }
  for (const [x, y] of QUAD_LETTER) {
    map.set(`${x},${y}`, "QL");
  }
  for (const [x, y] of DOUBLE_LETTER) {
    map.set(`${x},${y}`, "DL");
  }

  // Center zap (required for first move)
  map.set(`${CENTER_POSITION.x},${CENTER_POSITION.y}`, "ZAP");

  return map;
}

export const MULTIPLIER_MAP = buildMultiplierMap();

export function getMultiplier(x: number, y: number): MultiplierType {
  return MULTIPLIER_MAP.get(`${x},${y}`) || null;
}

// Generate a full tile bag
export function createTileBag(): string[] {
  const bag: string[] = [];
  for (const [letter, count] of Object.entries(TILE_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      bag.push(letter);
    }
  }
  return bag;
}

// Fisher-Yates shuffle
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
