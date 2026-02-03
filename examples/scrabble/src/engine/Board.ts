import type { TilePlacement, ValidationResult } from "../types/game";
import {
  BOARD_SIZE,
  CENTER_POSITION,
  LETTER_VALUES,
  getMultiplier,
  BINGO_BONUS,
  RACK_SIZE,
  ZAP_BONUS_POINTS,
} from "./constants";
import { getDictionary } from "./Dictionary";

export type Direction = "horizontal" | "vertical";

export interface WordFound {
  word: string;
  coords: string[];
  score: number;
}

/**
 * Check if a position is within board bounds
 */
export function isValidPosition(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

/**
 * Get letter at position from board
 */
export function getLetterAt(
  board: Record<string, string | { letter: string; isBlank?: boolean }>,
  x: number,
  y: number,
): string | null {
  const tile = board[`${x},${y}`];
  if (!tile) return null;
  if (typeof tile === "string") return tile;
  return tile.letter;
}

/**
 * Check if board is empty (first move)
 */
export function isBoardEmpty(
  board: Record<string, string | { letter: string; isBlank?: boolean }>,
): boolean {
  return Object.keys(board).length === 0;
}

/**
 * Determine the direction of a move based on tile placements
 */
export function getMoveDirection(
  placements: TilePlacement[],
): Direction | null {
  if (placements.length === 0) return null;
  if (placements.length === 1) return null; // Could be either

  const xs = new Set(placements.map((p) => p.x));
  const ys = new Set(placements.map((p) => p.y));

  if (xs.size === 1) return "vertical";
  if (ys.size === 1) return "horizontal";

  return null; // Invalid: tiles not in a line
}

/**
 * Check if tiles are placed in a continuous line (with existing tiles)
 */
export function areTilesContinuous(
  board: Record<string, string | { letter: string; isBlank?: boolean }>,
  placements: TilePlacement[],
): boolean {
  if (placements.length === 0) return false;
  if (placements.length === 1) return true;

  const direction = getMoveDirection(placements);
  if (!direction) return false;

  // Sort placements by position
  const sorted = [...placements].sort((a, b) => {
    if (direction === "horizontal") return a.x - b.x;
    return a.y - b.y;
  });

  // Check for gaps (must be filled by existing board tiles)
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (direction === "horizontal") {
      for (let x = current.x + 1; x < next.x; x++) {
        if (!getLetterAt(board, x, current.y)) {
          return false; // Gap not filled
        }
      }
    } else {
      for (let y = current.y + 1; y < next.y; y++) {
        if (!getLetterAt(board, current.x, y)) {
          return false; // Gap not filled
        }
      }
    }
  }

  return true;
}

/**
 * Check if the move connects to existing tiles (or is the first move)
 */
export function connectsToExisting(
  board: Record<string, string | { letter: string; isBlank?: boolean }>,
  placements: TilePlacement[],
): boolean {
  if (isBoardEmpty(board)) {
    // First move must cover center
    return placements.some(
      (p) => p.x === CENTER_POSITION.x && p.y === CENTER_POSITION.y,
    );
  }

  // Check if any placement is adjacent to an existing tile
  for (const p of placements) {
    const neighbors = [
      [p.x - 1, p.y],
      [p.x + 1, p.y],
      [p.x, p.y - 1],
      [p.x, p.y + 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (isValidPosition(nx, ny) && getLetterAt(board, nx, ny)) {
        return true;
      }
    }
  }

  // Also check if placements fill gaps between existing tiles
  const direction = getMoveDirection(placements);
  if (direction && placements.length > 0) {
    const sorted = [...placements].sort((a, b) => {
      if (direction === "horizontal") return a.x - b.x;
      return a.y - b.y;
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      if (direction === "horizontal") {
        for (let x = current.x + 1; x < next.x; x++) {
          if (getLetterAt(board, x, current.y)) {
            return true;
          }
        }
      } else {
        for (let y = current.y + 1; y < next.y; y++) {
          if (getLetterAt(board, current.x, y)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Extract a word in a given direction starting from a position
 */
export function extractWord(
  board: Record<string, string | { letter: string; isBlank?: boolean }>,
  placements: TilePlacement[],
  startX: number,
  startY: number,
  direction: Direction,
): WordFound | null {
  // Create a temporary board with new placements
  const tempBoard: Record<
    string,
    string | { letter: string; isBlank?: boolean }
  > = { ...board };
  for (const p of placements) {
    if (p.isBlank) {
      tempBoard[`${p.x},${p.y}`] = { letter: p.letter, isBlank: true };
    } else {
      tempBoard[`${p.x},${p.y}`] = p.letter;
    }
  }

  // Find the start of the word
  let x = startX;
  let y = startY;

  if (direction === "horizontal") {
    while (x > 0 && getLetterAt(tempBoard, x - 1, y)) {
      x--;
    }
  } else {
    while (y > 0 && getLetterAt(tempBoard, x, y - 1)) {
      y--;
    }
  }

  // Collect the word
  const letters: string[] = [];
  const coords: string[] = [];
  let currentX = x;
  let currentY = y;

  while (isValidPosition(currentX, currentY)) {
    const letter = getLetterAt(tempBoard, currentX, currentY);
    if (!letter) break;

    letters.push(letter);
    coords.push(`${currentX},${currentY}`);

    if (direction === "horizontal") {
      currentX++;
    } else {
      currentY++;
    }
  }

  if (letters.length < 2) {
    return null;
  }

  const word = letters.join("");
  const score = calculateWordScore(board, placements, coords);

  return { word, coords, score };
}

/**
 * Find all words formed by the placements
 */
export function findAllWords(
  board: Record<string, string | { letter: string; isBlank?: boolean }>,
  placements: TilePlacement[],
): WordFound[] {
  const words: WordFound[] = [];
  const processed = new Set<string>();

  if (placements.length === 0) return words;

  // Determine primary direction
  let primaryDirection: Direction = "horizontal";
  if (placements.length > 1) {
    const dir = getMoveDirection(placements);
    if (dir) primaryDirection = dir;
  }

  // Get the main word in the primary direction
  const mainWord = extractWord(
    board,
    placements,
    placements[0].x,
    placements[0].y,
    primaryDirection,
  );

  if (mainWord) {
    processed.add(mainWord.coords.join("|"));
    words.push(mainWord);
  }

  // Get perpendicular words for each new tile
  const perpDirection: Direction =
    primaryDirection === "horizontal" ? "vertical" : "horizontal";

  for (const p of placements) {
    const perpWord = extractWord(board, placements, p.x, p.y, perpDirection);
    if (perpWord) {
      const key = perpWord.coords.join("|");
      if (!processed.has(key)) {
        processed.add(key);
        words.push(perpWord);
      }
    }
  }

  return words;
}

/**
 * Calculate score for a single word
 */
export function calculateWordScore(
  board: Record<string, string | { letter: string; isBlank?: boolean }>,
  placements: TilePlacement[],
  wordCoords: string[],
): number {
  let wordScore = 0;
  let wordMultiplier = 1;
  let zapBonus = 0;

  const newTileCoords = new Set(placements.map((p) => `${p.x},${p.y}`));

  for (const coord of wordCoords) {
    const [x, y] = coord.split(",").map(Number);
    const isNewTile = newTileCoords.has(coord);

    // Get the letter and blank status (from placements or existing board)
    let letter: string;
    let isBlank = false;
    if (isNewTile) {
      const placement = placements.find((p) => p.x === x && p.y === y);
      letter = placement!.letter;
      isBlank = placement!.isBlank || false;
    } else {
      const tile = board[coord];
      if (typeof tile === "string") {
        letter = tile;
      } else {
        letter = tile.letter;
        isBlank = tile.isBlank || false;
      }
    }

    // Base letter value (BLANK tiles are worth 0)
    const letterValue = isBlank ? 0 : LETTER_VALUES[letter] || 0;
    let tileScore = letterValue;

    // Apply multipliers only for newly placed tiles
    if (isNewTile) {
      const mult = getMultiplier(x, y);
      switch (mult) {
        case "DL":
          tileScore *= 2;
          break;
        case "QL":
          tileScore *= 4;
          break;
        case "DW":
          wordMultiplier *= 2;
          break;
        case "ZAP":
          zapBonus += ZAP_BONUS_POINTS;
          break;
      }
    }

    wordScore += tileScore;
  }

  return wordScore * wordMultiplier + zapBonus;
}

/**
 * Calculate total score for a move (all words + bingo bonus)
 */
export function calculateMoveScore(
  board: Record<string, string | { letter: string; isBlank?: boolean }>,
  placements: TilePlacement[],
): number {
  const words = findAllWords(board, placements);
  let total = words.reduce((sum, w) => sum + w.score, 0);

  // Bingo bonus for using all 7 tiles
  if (placements.length === RACK_SIZE) {
    total += BINGO_BONUS;
  }

  return total;
}

/**
 * Validate a move and return all formed words
 */
export function validateMove(
  board: Record<string, string | { letter: string; isBlank?: boolean }>,
  placements: TilePlacement[],
): ValidationResult {
  // Check for empty move
  if (placements.length === 0) {
    return { valid: false, error: "No tiles placed" };
  }

  // Check all positions are valid and empty
  for (const p of placements) {
    if (!isValidPosition(p.x, p.y)) {
      return { valid: false, error: `Invalid position: ${p.x},${p.y}` };
    }
    if (getLetterAt(board, p.x, p.y)) {
      return { valid: false, error: `Position ${p.x},${p.y} already occupied` };
    }
  }

  // Check tiles are in a line
  if (placements.length > 1) {
    const direction = getMoveDirection(placements);
    if (!direction) {
      return { valid: false, error: "Tiles must be placed in a straight line" };
    }
  }

  // Check tiles are continuous
  if (!areTilesContinuous(board, placements)) {
    return { valid: false, error: "Tiles must form a continuous line" };
  }

  // Check connection to existing tiles
  if (!connectsToExisting(board, placements)) {
    if (isBoardEmpty(board)) {
      return { valid: false, error: "First move must cover center square" };
    }
    return { valid: false, error: "Move must connect to existing tiles" };
  }

  // Find all words formed
  const words = findAllWords(board, placements);

  if (words.length === 0) {
    return { valid: false, error: "No valid words formed" };
  }

  // Validate all words against dictionary
  const dictionary = getDictionary();
  if (dictionary.isLoaded()) {
    for (const w of words) {
      if (!dictionary.isValidWord(w.word)) {
        return { valid: false, error: `Invalid word: ${w.word}` };
      }
    }
  }

  // Calculate total score
  const score =
    words.reduce((sum, w) => sum + w.score, 0) +
    (placements.length === RACK_SIZE ? BINGO_BONUS : 0);

  return {
    valid: true,
    words: words.map((w) => w.word),
    score,
  };
}

/**
 * Apply placements to board and return new board state
 */
export function applyPlacements(
  board: Record<string, string | { letter: string; isBlank?: boolean }>,
  placements: TilePlacement[],
): Record<string, string | { letter: string; isBlank?: boolean }> {
  const newBoard = { ...board };
  for (const p of placements) {
    if (p.isBlank) {
      newBoard[`${p.x},${p.y}`] = { letter: p.letter, isBlank: true };
    } else {
      newBoard[`${p.x},${p.y}`] = p.letter;
    }
  }
  return newBoard;
}
