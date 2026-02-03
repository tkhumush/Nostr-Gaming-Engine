/**
 * Game Engine
 *
 * Implement your game logic here. All methods should be pure functions
 * (no side effects, same input always produces same output).
 */

import { v4 as uuidv4 } from "uuid";
import type { GameState, GameMove, ValidationResult } from "../types/game";

export class GameEngine {
  /**
   * Initialize a new game
   *
   * @param playerOne - Hex pubkey of first player
   * @param playerTwo - Hex pubkey of second player
   * @returns Initial game state
   */
  static initializeGame(playerOne: string, playerTwo: string): GameState {
    return {
      meta: {
        gameId: uuidv4(),
        playerOne,
        playerTwo,
        status: "active",
      },
      turn: {
        index: 0,
        activePlayer: playerOne, // First player moves first
        timestamp: Date.now(),
        lastMoveHash: "",
      },
      // TODO: Initialize your game-specific state
      // board: {},
      // scores: { p1: 0, p2: 0 },
    };
  }

  /**
   * Validate a proposed move
   *
   * @param state - Current game state
   * @param move - Proposed move
   * @returns Validation result
   */
  static validateMove(state: GameState, move: GameMove): ValidationResult {
    // Check game is active
    if (state.meta.status !== "active") {
      return { valid: false, error: "Game is not active" };
    }

    // TODO: Implement your move validation
    // Example:
    // if (!isValidPosition(move.position)) {
    //   return { valid: false, error: "Invalid position" };
    // }
    // if (state.board[positionKey(move.position)]) {
    //   return { valid: false, error: "Position already occupied" };
    // }

    return { valid: true };
  }

  /**
   * Apply a validated move and return new state
   *
   * @param state - Current game state
   * @param move - Move to apply (already validated)
   * @param playerPubkey - Hex pubkey of player making the move
   * @param previousEventId - Event ID of the current state (for chain validation)
   * @returns New game state
   */
  static applyMove(
    state: GameState,
    move: GameMove,
    playerPubkey: string,
    previousEventId: string,
  ): { state: GameState } {
    // Create new state (immutable update)
    const newState: GameState = {
      ...state,
      turn: {
        index: state.turn.index + 1,
        activePlayer: this.getOpponent(state, playerPubkey),
        timestamp: Date.now(),
        lastMoveHash: previousEventId,
      },
      // TODO: Apply your move to the game state
      // board: { ...state.board, [positionKey(move.position)]: playerPubkey },
    };

    // Check for game end
    if (this.isGameOver(newState)) {
      newState.meta = {
        ...newState.meta,
        status: "completed",
        winner: this.determineWinner(newState),
      };
    }

    return { state: newState };
  }

  /**
   * Handle a pass (skip turn)
   */
  static applyPass(
    state: GameState,
    playerPubkey: string,
    previousEventId: string,
  ): GameState {
    return {
      ...state,
      turn: {
        index: state.turn.index + 1,
        activePlayer: this.getOpponent(state, playerPubkey),
        timestamp: Date.now(),
        lastMoveHash: previousEventId,
      },
    };
  }

  /**
   * Handle resignation
   */
  static resign(state: GameState, resigningPlayer: string): GameState {
    return {
      ...state,
      meta: {
        ...state.meta,
        status: "abandoned",
        winner: this.getOpponent(state, resigningPlayer),
      },
    };
  }

  /**
   * Check if game is over
   */
  static isGameOver(state: GameState): boolean {
    // TODO: Implement your game-over detection
    // Example:
    // return hasWinner(state) || isBoardFull(state);
    return false;
  }

  /**
   * Determine the winner (if any)
   */
  static determineWinner(state: GameState): string | undefined {
    // TODO: Implement winner detection
    // Example:
    // return checkWinCondition(state);
    return undefined;
  }

  /**
   * Check if it's a specific player's turn
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
}
