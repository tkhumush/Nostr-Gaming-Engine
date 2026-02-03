/**
 * Game State Types
 *
 * Define your game state structure here.
 * The `meta` and `turn` fields are required by the platform.
 */

export type GameStatus = "active" | "completed" | "abandoned" | "deleted";

/**
 * Core game metadata - required by platform
 */
export interface GameMeta {
  gameId: string;
  playerOne: string; // Hex pubkey
  playerTwo: string; // Hex pubkey
  status: GameStatus;
  winner?: string;
  deletedBy?: string;
}

/**
 * Turn tracking - required by platform
 */
export interface TurnInfo {
  index: number; // Turn counter (starts at 0)
  activePlayer: string; // Hex pubkey of who moves next
  timestamp: number; // Unix timestamp of last move
  lastMoveHash: string; // Event ID of previous state (chain validation)
}

/**
 * Your game state
 *
 * Extend this with your game-specific fields.
 * Examples:
 * - Chess: board (FEN), moveHistory (PGN)
 * - Checkers: board grid, captured pieces
 * - Tic-tac-toe: 3x3 grid
 */
export interface GameState {
  meta: GameMeta;
  turn: TurnInfo;

  // TODO: Add your game-specific state here
  // Example for a simple game:
  // board: Record<string, string>;
  // scores: { p1: number; p2: number };
}

/**
 * Your move type
 *
 * Define what a "move" looks like in your game.
 * Examples:
 * - Chess: { from: "e2", to: "e4", promotion?: "q" }
 * - Checkers: { from: [2, 3], to: [3, 4], captures?: [[2, 4]] }
 * - Tic-tac-toe: { x: 1, y: 1 }
 */
export interface GameMove {
  // TODO: Define your move structure
  // Example:
  // position: { x: number; y: number };
  // action: string;
}

/**
 * Validation result returned by your game engine
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  // Add game-specific validation info
  // score?: number;
  // captures?: string[];
}
