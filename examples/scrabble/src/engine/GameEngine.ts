import { v4 as uuidv4 } from "uuid";
import type {
  GameState,
  TilePlacement,
  Move,
  ValidationResult,
  MoveHistory,
} from "../types/game";
import {
  createTileBag,
  shuffleArray,
  RACK_SIZE,
  BINGO_BONUS,
  LETTER_VALUES,
} from "./constants";
import { validateMove, applyPlacements, findAllWords } from "./Board";

/**
 * Core game engine - handles all Scrabble game logic
 * Stateless pure functions - no side effects
 */
export class GameEngine {
  private static readonly MAX_HISTORY_ENTRIES = 60;
  /**
   * Initialize a new game between two players
   */
  static initializeGame(playerOne: string, playerTwo: string): GameState {
    const gameId = uuidv4();
    const shuffledBag = shuffleArray(createTileBag());

    return {
      meta: {
        gameId,
        playerOne,
        playerTwo,
        status: "active",
      },
      turn: {
        index: 0,
        activePlayer: playerOne, // Player one goes first
        timestamp: Date.now(),
        lastMoveHash: "", // Empty for initial state
      },
      board: {},
      scoring: {
        p1Score: 0,
        p2Score: 0,
        history: [],
      },
      tileBag: shuffledBag,
    };
  }

  /**
   * Draw tiles from the bag
   * Returns [drawnTiles, remainingBag]
   */
  static drawTiles(bag: string[], count: number): [string[], string[]] {
    const actualCount = Math.min(count, bag.length);
    const drawn = bag.slice(0, actualCount);
    const remaining = bag.slice(actualCount);
    return [drawn, remaining];
  }

  /**
   * Draw initial rack for a player (7 tiles)
   */
  static drawInitialRack(bag: string[]): [string[], string[]] {
    return this.drawTiles(bag, RACK_SIZE);
  }

  /**
   * Validate that it's the player's turn
   */
  static isPlayerTurn(state: GameState, playerPubkey: string): boolean {
    return state.turn.activePlayer === playerPubkey;
  }

  /**
   * Get the opponent's pubkey
   */
  static getOpponent(state: GameState, playerPubkey: string): string {
    return state.meta.playerOne === playerPubkey
      ? state.meta.playerTwo
      : state.meta.playerOne;
  }

  /**
   * Validate a move (placement validity + word validity)
   */
  static validateMove(
    state: GameState,
    placements: TilePlacement[],
    playerRack: string[],
  ): ValidationResult {
    // Check game is active
    if (state.meta.status !== "active") {
      return { valid: false, error: "Game is not active" };
    }

    // Check it's the player's turn
    // (caller must verify this separately since we don't have player pubkey here)

    // Check player has the tiles
    const rackCopy = [...playerRack];
    for (const p of placements) {
      const tileToUse = p.isBlank ? "BLANK" : p.letter;
      const idx = rackCopy.indexOf(tileToUse);
      if (idx === -1) {
        return { valid: false, error: `Tile ${tileToUse} not in rack` };
      }
      rackCopy.splice(idx, 1);
    }

    // Validate board placement
    return validateMove(state.board, placements);
  }

  /**
   * Apply a move and return the new game state
   * Does NOT modify the input state (immutable)
   */
  static applyMove(
    state: GameState,
    placements: TilePlacement[],
    playerPubkey: string,
    previousEventId: string,
  ): { state: GameState; move: Move; tilesDrawn: string[] } {
    // Find all words and calculate score
    const words = findAllWords(state.board, placements);
    let score = words.reduce((sum, w) => sum + w.score, 0);

    // Bingo bonus
    if (placements.length === RACK_SIZE) {
      score += BINGO_BONUS;
    }

    // Apply to board
    const newBoard = applyPlacements(state.board, placements);

    // Draw new tiles
    const [tilesDrawn, newBag] = this.drawTiles(
      state.tileBag,
      placements.length,
    );

    // Determine opponent
    const opponent = this.getOpponent(state, playerPubkey);

    // Update scores
    const isPlayerOne = state.meta.playerOne === playerPubkey;
    const newScoring = {
      p1Score: isPlayerOne
        ? state.scoring.p1Score + score
        : state.scoring.p1Score,
      p2Score: !isPlayerOne
        ? state.scoring.p2Score + score
        : state.scoring.p2Score,
      history: [
        ...state.scoring.history,
        {
          player: playerPubkey,
          word: words.map((w) => w.word).join(", "),
          score,
          coords: placements.map((p) => `${p.x},${p.y}`),
        } as MoveHistory,
      ].slice(-GameEngine.MAX_HISTORY_ENTRIES),
    };

    // Create new state
    const newState: GameState = {
      meta: { ...state.meta },
      turn: {
        index: state.turn.index + 1,
        activePlayer: opponent,
        timestamp: Date.now(),
        lastMoveHash: previousEventId,
      },
      board: newBoard,
      scoring: newScoring,
      tileBag: newBag,
    };

    const move: Move = {
      placements,
      word: words.map((w) => w.word).join(", "),
      score,
    };

    return { state: newState, move, tilesDrawn };
  }

  /**
   * Handle a pass (skip turn)
   */
  static applyPass(
    state: GameState,
    playerPubkey: string,
    previousEventId: string,
  ): GameState {
    const opponent = this.getOpponent(state, playerPubkey);

    return {
      ...state,
      turn: {
        index: state.turn.index + 1,
        activePlayer: opponent,
        timestamp: Date.now(),
        lastMoveHash: previousEventId,
      },
      scoring: {
        ...state.scoring,
        history: [
          ...state.scoring.history,
          {
            player: playerPubkey,
            word: "(PASS)",
            score: 0,
            coords: [],
          },
        ].slice(-GameEngine.MAX_HISTORY_ENTRIES),
      },
    };
  }

  /**
   * Exchange tiles (counts as a turn)
   * Returns [newBag, tilesToReturn] - caller adds tilesToReturn to end of bag
   */
  static exchangeTiles(
    state: GameState,
    tilesToExchange: string[],
    _playerRack: string[],
    playerPubkey: string,
    previousEventId: string,
  ): { state: GameState; newTiles: string[]; returnedTiles: string[] } {
    // Can't exchange if fewer tiles in bag than exchanging
    if (tilesToExchange.length > state.tileBag.length) {
      throw new Error("Not enough tiles in bag to exchange");
    }

    // Draw new tiles first
    const [newTiles, tempBag] = this.drawTiles(
      state.tileBag,
      tilesToExchange.length,
    );

    // Add exchanged tiles back to bag (at end)
    const newBag = [...tempBag, ...tilesToExchange];

    const opponent = this.getOpponent(state, playerPubkey);

    const newState: GameState = {
      ...state,
      turn: {
        index: state.turn.index + 1,
        activePlayer: opponent,
        timestamp: Date.now(),
        lastMoveHash: previousEventId,
      },
      tileBag: newBag,
      scoring: {
        ...state.scoring,
        history: [
          ...state.scoring.history,
          {
            player: playerPubkey,
            word: `(EXCHANGE ${tilesToExchange.length})`,
            score: 0,
            coords: [],
          },
        ].slice(-GameEngine.MAX_HISTORY_ENTRIES),
      },
    };

    return { state: newState, newTiles, returnedTiles: tilesToExchange };
  }

  /**
   * Check if the game is over
   */
  static isGameOver(
    state: GameState,
    _p1Rack: string[],
    _p2Rack: string[],
  ): boolean {
    // Game over if both players pass consecutively
    const recentHistory = state.scoring.history.slice(-2);
    if (recentHistory.length === 2) {
      const allPasses = recentHistory.every((h) => h.word === "(PASS)");
      if (allPasses) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate final scores (subtract remaining rack values)
   */
  static calculateFinalScores(
    state: GameState,
    p1Rack: string[],
    p2Rack: string[],
  ): { p1Final: number; p2Final: number; winner: string | null } {
    const p1RackValue = p1Rack.reduce(
      (sum, t) => sum + (LETTER_VALUES[t] || 0),
      0,
    );
    const p2RackValue = p2Rack.reduce(
      (sum, t) => sum + (LETTER_VALUES[t] || 0),
      0,
    );

    // Player who went out gets opponent's rack value added
    let p1Final = state.scoring.p1Score;
    let p2Final = state.scoring.p2Score;

    if (p1Rack.length === 0) {
      p1Final += p2RackValue;
      p2Final -= p2RackValue;
    } else if (p2Rack.length === 0) {
      p2Final += p1RackValue;
      p1Final -= p1RackValue;
    } else {
      // Both have tiles (ended by passes) - just subtract rack values
      p1Final -= p1RackValue;
      p2Final -= p2RackValue;
    }

    let winner: string | null = null;
    if (p1Final > p2Final) {
      winner = state.meta.playerOne;
    } else if (p2Final > p1Final) {
      winner = state.meta.playerTwo;
    }
    // null if tie

    return { p1Final, p2Final, winner };
  }

  /**
   * End the game and determine winner
   */
  static endGame(
    state: GameState,
    p1Rack: string[],
    p2Rack: string[],
  ): GameState {
    const { p1Final, p2Final, winner } = this.calculateFinalScores(
      state,
      p1Rack,
      p2Rack,
    );

    return {
      ...state,
      meta: {
        ...state.meta,
        status: "completed",
        winner: winner || undefined,
      },
      scoring: {
        ...state.scoring,
        p1Score: p1Final,
        p2Score: p2Final,
      },
    };
  }

  /**
   * Abandon a game (player resigns)
   */
  static abandonGame(state: GameState, resigningPlayer: string): GameState {
    const winner = this.getOpponent(state, resigningPlayer);

    return {
      ...state,
      meta: {
        ...state.meta,
        status: "abandoned",
        winner,
      },
    };
  }

  /**
   * Delete a game (creator removes the game)
   */
  static deleteGame(state: GameState, deletedBy: string): GameState {
    return {
      ...state,
      meta: {
        ...state.meta,
        status: "deleted",
        deletedBy,
        winner: undefined,
      },
    };
  }

  /**
   * Validate state chain integrity
   */
  static validateStateChain(
    currentState: GameState,
    newTurnIndex: number,
    newLastMoveHash: string,
    expectedPreviousEventId: string,
  ): boolean {
    // Turn index must increment by exactly 1
    if (newTurnIndex !== currentState.turn.index + 1) {
      return false;
    }

    // Last move hash must match the previous event ID
    if (newLastMoveHash !== expectedPreviousEventId) {
      return false;
    }

    return true;
  }
}

export default GameEngine;
