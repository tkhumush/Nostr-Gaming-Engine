/**
 * Game Hook
 *
 * React hook for managing game state with Nostr sync.
 * Customize this for your specific game.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  NostrSync,
  getCurrentUser,
  useWallet,
  type ZapParams,
} from "@nostr-gaming-engine/core";
import { GameEngine } from "../engine/GameEngine";
import type { GameState, GameMove } from "../types/game";

export interface UseGameReturn {
  // State
  gameState: GameState | null;
  loading: boolean;
  error: string | null;
  isMyTurn: boolean;
  gameId: string | null;

  // Actions
  createGame: (opponentPubkey: string) => Promise<string>;
  loadGame: (gameId: string, opponentPubkey: string) => Promise<void>;
  makeMove: (move: GameMove) => Promise<{ success?: boolean; error?: string }>;
  pass: () => Promise<void>;
  resign: () => Promise<void>;

  // Optional: Zap opponent
  zapOpponent: (amount: number, message: string) => Promise<void>;
}

export function useGame(): UseGameReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [lastEventId, setLastEventId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncRef = useRef<NostrSync | null>(null);
  const user = getCurrentUser();
  const myPubkey = user?.pubkey || "";

  const { zapUser } = useWallet();

  // Derived state
  const isMyTurn = gameState
    ? GameEngine.isPlayerTurn(gameState, myPubkey)
    : false;
  const gameId = gameState?.meta.gameId || null;

  // Create a new game
  const createGame = useCallback(
    async (opponentPubkey: string): Promise<string> => {
      if (!myPubkey) throw new Error("Not logged in");

      setLoading(true);
      setError(null);

      try {
        const state = GameEngine.initializeGame(myPubkey, opponentPubkey);
        syncRef.current = new NostrSync(state.meta.gameId, opponentPubkey);

        const eventId = await syncRef.current.publishGameState(state, "");

        setGameState(state);
        setLastEventId(eventId);

        return state.meta.gameId;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Failed to create game";
        setError(errorMsg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [myPubkey],
  );

  // Load existing game
  const loadGame = useCallback(
    async (gameId: string, opponentPubkey: string): Promise<void> => {
      if (!myPubkey) throw new Error("Not logged in");

      setLoading(true);
      setError(null);

      try {
        syncRef.current = new NostrSync(gameId, opponentPubkey);
        const result = await syncRef.current.fetchLatestGameState();

        if (result) {
          setGameState(result.state as GameState);
          setLastEventId(result.event.id || "");
        } else {
          throw new Error("Game not found");
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Failed to load game";
        setError(errorMsg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [myPubkey],
  );

  // Make a move
  const makeMove = useCallback(
    async (move: GameMove): Promise<{ success?: boolean; error?: string }> => {
      if (!gameState || !syncRef.current) {
        return { error: "No game loaded" };
      }

      if (!GameEngine.isPlayerTurn(gameState, myPubkey)) {
        return { error: "Not your turn" };
      }

      // Validate
      const validation = GameEngine.validateMove(gameState, move);
      if (!validation.valid) {
        return { error: validation.error };
      }

      // Apply
      const { state: newState } = GameEngine.applyMove(
        gameState,
        move,
        myPubkey,
        lastEventId,
      );

      try {
        const eventId = await syncRef.current.publishGameState(
          newState,
          lastEventId,
        );
        setGameState(newState);
        setLastEventId(eventId);
        return { success: true };
      } catch (e) {
        return { error: "Failed to publish move" };
      }
    },
    [gameState, lastEventId, myPubkey],
  );

  // Pass turn
  const pass = useCallback(async (): Promise<void> => {
    if (!gameState || !syncRef.current) return;

    const newState = GameEngine.applyPass(gameState, myPubkey, lastEventId);
    const eventId = await syncRef.current.publishGameState(newState, lastEventId);
    setGameState(newState);
    setLastEventId(eventId);
  }, [gameState, lastEventId, myPubkey]);

  // Resign
  const resign = useCallback(async (): Promise<void> => {
    if (!gameState || !syncRef.current) return;

    const newState = GameEngine.resign(gameState, myPubkey);
    const eventId = await syncRef.current.publishGameState(newState, lastEventId);
    setGameState(newState);
    setLastEventId(eventId);
  }, [gameState, lastEventId, myPubkey]);

  // Zap opponent
  const zapOpponent = useCallback(
    async (amount: number, message: string): Promise<void> => {
      if (!gameState) return;

      const opponentPubkey = GameEngine.getOpponent(gameState, myPubkey);
      const params: ZapParams = {
        recipientPubkey: opponentPubkey,
        amountSats: amount,
        gameId: gameState.meta.gameId,
        moveDescription: message,
      };

      await zapUser(params);
    },
    [gameState, myPubkey, zapUser],
  );

  // Subscribe to opponent moves
  useEffect(() => {
    if (!syncRef.current || !gameState) return;

    syncRef.current.subscribeToGameUpdates(
      (update) => {
        setGameState(update.state as GameState);
        setLastEventId(update.event.id || "");
      },
      (err) => setError(err.message),
      { heartbeatMs: 30000 },
    );

    return () => syncRef.current?.stopSubscription();
  }, [gameState?.meta.gameId]);

  // Browser notifications
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  return {
    gameState,
    loading,
    error,
    isMyTurn,
    gameId,
    createGame,
    loadGame,
    makeMove,
    pass,
    resign,
    zapOpponent,
  };
}
