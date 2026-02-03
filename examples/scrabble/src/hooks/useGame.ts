import { useState, useEffect, useCallback, useRef } from "react";
import type { GameState, TilePlacement, ValidationResult } from "../types/game";
import {
  NostrSync,
  getCurrentUser,
  type DecryptedGameEvent,
} from "@nostr-gaming-engine/core";
import { GameEngine } from "../engine/GameEngine";
import { TILE_DISTRIBUTION } from "../engine/constants";

export interface UseGameReturn {
  gameState: GameState | null;
  playerRack: string[];
  isMyTurn: boolean;
  isLoading: boolean;
  error: string | null;
  lastEventId: string | null;

  // Actions
  createGame: (opponentPubkey: string) => Promise<string>;
  loadGame: (gameId: string, opponentPubkey: string) => Promise<void>;
  makeMove: (placements: TilePlacement[]) => Promise<ValidationResult>;
  pass: () => Promise<void>;
  exchange: (tiles: string[]) => Promise<void>;
  resign: () => Promise<void>;
  deleteGame: () => Promise<void>;

  // Validation
  validateMove: (placements: TilePlacement[]) => ValidationResult;
}

export function useGame(): UseGameReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerRack, setPlayerRack] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  const syncRef = useRef<NostrSync | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevIsMyTurnRef = useRef<boolean | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const lastEventIdRef = useRef<string | null>(null);

  const user = getCurrentUser();
  const myPubkey = user?.pubkey || "";

  const isMyTurn = gameState?.turn.activePlayer === myPubkey;

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    lastEventIdRef.current = lastEventId;
  }, [lastEventId]);

  const deriveOpponentRack = useCallback(
    (state: GameState, myRack: string[]): string[] => {
      const counts: Record<string, number> = { ...TILE_DISTRIBUTION };
      const consume = (tile: string) => {
        const key = tile.toUpperCase();
        if (counts[key] === undefined) return;
        counts[key] = Math.max(0, counts[key] - 1);
      };

      for (const tile of state.tileBag) {
        consume(tile);
      }

      for (const tile of myRack) {
        consume(tile);
      }

      for (const value of Object.values(state.board)) {
        if (!value) continue;
        if (typeof value === "string") {
          consume(value === "BLANK" ? "BLANK" : value);
        } else {
          consume(value.isBlank ? "BLANK" : value.letter);
        }
      }

      const opponentRack: string[] = [];
      for (const [letter, count] of Object.entries(counts)) {
        for (let i = 0; i < count; i += 1) {
          opponentRack.push(letter);
        }
      }
      return opponentRack;
    },
    [],
  );

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Send browser notification when it becomes your turn
  useEffect(() => {
    if (prevIsMyTurnRef.current === false && isMyTurn === true) {
      // It just became our turn - always notify
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Words With Zaps", {
          body: "It's your turn!",
          icon: "/assets/wwz_logo_stack.svg",
        });
      }
    }
    prevIsMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  // Handle incoming game updates
  const handleGameUpdate = useCallback((event: DecryptedGameEvent) => {
    // Validate the update
    const currentState = gameStateRef.current;
    const currentEventId = lastEventIdRef.current;
    if (currentState && currentEventId) {
      const validation = syncRef.current?.validateStateUpdate(
        currentState,
        event,
        currentEventId,
      );

      if (validation && !validation.valid) {
        console.warn("Invalid state update:", validation.error);
        return;
      }
    }

    setGameState(event.state);
    setLastEventId(event.event.id);
  }, []);

  // Create a new game
  const createGame = useCallback(
    async (opponentPubkey: string): Promise<string> => {
      if (!myPubkey) {
        throw new Error("Must be logged in to create a game");
      }

      setIsLoading(true);
      setError(null);

      try {
        const { gameId, state } = await NostrSync.createGame(
          myPubkey,
          opponentPubkey,
        );

        // Draw initial rack for player one
        const [rack, remainingBag] = GameEngine.drawInitialRack(state.tileBag);
        const updatedState = { ...state, tileBag: remainingBag };

        // Set up sync
        syncRef.current = new NostrSync(gameId, opponentPubkey);

        // Save rack
        await syncRef.current.savePlayerRack({ rack });

        // Publish updated state with reduced tile bag so relays don't keep the full bag
        const updatedEventId = await syncRef.current.publishGameState(
          updatedState,
          "",
        );

        setGameState(updatedState);
        setPlayerRack(rack);
        setLastEventId(updatedEventId);

        // Subscribe to updates
        syncRef.current.subscribeToGameUpdates(
          handleGameUpdate,
          (err) => {
            setError(err.message);
          },
          { heartbeatMs: 45000 },
        );

        return gameId;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create game";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [myPubkey, handleGameUpdate],
  );

  // Load an existing game
  const loadGame = useCallback(
    async (gameId: string, opponentPubkey: string) => {
      if (!myPubkey) {
        throw new Error("Must be logged in to load a game");
      }

      setIsLoading(true);
      setError(null);

      try {
        // Set up sync
        syncRef.current = new NostrSync(gameId, opponentPubkey);

        // Fetch latest state
        const latest = await syncRef.current.fetchLatestGameState();
        if (!latest) {
          throw new Error("Game not found");
        }

        // Fetch player rack
        const rackData = await syncRef.current.fetchPlayerRack();

        let rack = rackData?.rack || [];
        let updatedState = latest.state;

        // If no rack exists, this player needs to draw their initial tiles
        if (rack.length === 0 && updatedState.meta.status === "active") {
          const [drawnRack, remainingBag] = GameEngine.drawInitialRack(
            updatedState.tileBag,
          );
          rack = drawnRack;
          updatedState = { ...updatedState, tileBag: remainingBag };

          // Save the rack to relays
          await syncRef.current.savePlayerRack({ rack });

          // Publish updated state with reduced tile bag
          await syncRef.current.publishGameState(updatedState, latest.event.id);
        }

        setGameState(updatedState);
        setLastEventId(latest.event.id);
        setPlayerRack(rack);

        // Subscribe to updates
        syncRef.current.subscribeToGameUpdates(
          handleGameUpdate,
          (err) => {
            setError(err.message);
          },
          { heartbeatMs: 45000 },
        );

        // Set up polling as backup (every 15 seconds)
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        pollIntervalRef.current = setInterval(async () => {
          if (!syncRef.current) return;
          try {
            const latest = await syncRef.current.fetchLatestGameState();
            const currentEventId = lastEventIdRef.current;
            if (latest && latest.event.id !== currentEventId) {
              setGameState(latest.state);
              setLastEventId(latest.event.id);

              // Also refresh the rack
              const rackData = await syncRef.current.fetchPlayerRack();
              if (rackData?.rack) {
                setPlayerRack(rackData.rack);
              }
            }
          } catch (err) {
            console.warn("Polling error:", err);
          }
        }, 15000);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load game";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [myPubkey, handleGameUpdate, lastEventId],
  );

  // Validate a potential move
  const validateMoveAction = useCallback(
    (placements: TilePlacement[]): ValidationResult => {
      if (!gameState) {
        return { valid: false, error: "No game loaded" };
      }

      return GameEngine.validateMove(gameState, placements, playerRack);
    },
    [gameState, playerRack],
  );

  // Make a move
  const makeMove = useCallback(
    async (placements: TilePlacement[]): Promise<ValidationResult> => {
      if (!gameState || !syncRef.current || !myPubkey) {
        return { valid: false, error: "Game not ready" };
      }

      if (!isMyTurn) {
        return { valid: false, error: "Not your turn" };
      }

      const validation = validateMoveAction(placements);
      if (!validation.valid) {
        return validation;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Apply the move
        const {
          state: newState,
          move,
          tilesDrawn,
        } = GameEngine.applyMove(
          gameState,
          placements,
          myPubkey,
          lastEventId || "",
        );

        // Update rack: remove used tiles, add drawn tiles
        const newRack = [...playerRack];
        for (const p of placements) {
          const tileToRemove = p.isBlank ? "BLANK" : p.letter;
          const idx = newRack.indexOf(tileToRemove);
          if (idx !== -1) {
            newRack.splice(idx, 1);
          }
        }
        newRack.push(...tilesDrawn);

        const opponentRack = deriveOpponentRack(newState, newRack);
        const p1Rack =
          myPubkey === newState.meta.playerOne ? newRack : opponentRack;
        const p2Rack =
          myPubkey === newState.meta.playerTwo ? newRack : opponentRack;
        const didGoOut = newRack.length === 0;
        const finalState =
          didGoOut || GameEngine.isGameOver(newState, p1Rack, p2Rack)
            ? GameEngine.endGame(newState, p1Rack, p2Rack)
            : newState;

        // Publish to Nostr
        const eventId = await syncRef.current.publishGameState(
          finalState,
          lastEventId || "",
        );

        // Save updated rack
        await syncRef.current.savePlayerRack({ rack: newRack });

        // Update local state
        setGameState(finalState);
        setPlayerRack(newRack);
        setLastEventId(eventId);

        return {
          valid: true,
          words: validation.words,
          score: move.score,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to make move";
        setError(message);
        return { valid: false, error: message };
      } finally {
        setIsLoading(false);
      }
    },
    [
      gameState,
      myPubkey,
      isMyTurn,
      lastEventId,
      playerRack,
      deriveOpponentRack,
      validateMoveAction,
    ],
  );

  // Pass turn
  const pass = useCallback(async () => {
    if (!gameState || !syncRef.current || !myPubkey) {
      throw new Error("Game not ready");
    }

    if (!isMyTurn) {
      throw new Error("Not your turn");
    }

    setIsLoading(true);
    setError(null);

    try {
      const newState = GameEngine.applyPass(
        gameState,
        myPubkey,
        lastEventId || "",
      );
      const opponentRack = deriveOpponentRack(newState, playerRack);
      const p1Rack =
        myPubkey === newState.meta.playerOne ? playerRack : opponentRack;
      const p2Rack =
        myPubkey === newState.meta.playerTwo ? playerRack : opponentRack;
      const finalState = GameEngine.isGameOver(newState, p1Rack, p2Rack)
        ? GameEngine.endGame(newState, p1Rack, p2Rack)
        : newState;
      const eventId = await syncRef.current.publishGameState(
        finalState,
        lastEventId || "",
      );

      setGameState(finalState);
      setLastEventId(eventId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to pass";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [
    gameState,
    myPubkey,
    isMyTurn,
    lastEventId,
    playerRack,
    deriveOpponentRack,
  ]);

  // Exchange tiles
  const exchange = useCallback(
    async (tiles: string[]) => {
      if (!gameState || !syncRef.current || !myPubkey) {
        throw new Error("Game not ready");
      }

      if (!isMyTurn) {
        throw new Error("Not your turn");
      }

      setIsLoading(true);
      setError(null);

      try {
        const { state: newState, newTiles } = GameEngine.exchangeTiles(
          gameState,
          tiles,
          playerRack,
          myPubkey,
          lastEventId || "",
        );

        // Update rack
        const newRack = playerRack.filter((t) => !tiles.includes(t));
        newRack.push(...newTiles);

        const eventId = await syncRef.current.publishGameState(
          newState,
          lastEventId || "",
        );
        await syncRef.current.savePlayerRack({ rack: newRack });

        setGameState(newState);
        setPlayerRack(newRack);
        setLastEventId(eventId);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to exchange";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [gameState, myPubkey, isMyTurn, lastEventId, playerRack],
  );

  // Resign
  const resign = useCallback(async () => {
    if (!gameState || !syncRef.current || !myPubkey) {
      throw new Error("Game not ready");
    }

    setIsLoading(true);
    setError(null);

    try {
      const newState = GameEngine.abandonGame(gameState, myPubkey);
      const eventId = await syncRef.current.publishGameState(
        newState,
        lastEventId || "",
      );

      setGameState(newState);
      setLastEventId(eventId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resign";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [gameState, myPubkey, lastEventId]);

  // Delete game (creator only)
  const deleteGame = useCallback(async () => {
    if (!gameState || !syncRef.current || !myPubkey) {
      throw new Error("Game not ready");
    }

    if (gameState.meta.playerOne !== myPubkey) {
      throw new Error("Only the game creator can delete this game");
    }

    setIsLoading(true);
    setError(null);

    try {
      const newState = GameEngine.deleteGame(gameState, myPubkey);
      const eventId = await syncRef.current.publishGameState(
        newState,
        lastEventId || "",
      );
      // Best-effort deletion notice for creator's events
      try {
        await syncRef.current.publishDeletionForGame(
          `Deleted Words With Zaps game ${gameState.meta.gameId}`,
        );
      } catch (err) {
        console.warn("Failed to publish deletion event:", err);
      }

      setGameState(newState);
      setLastEventId(eventId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [gameState, myPubkey, lastEventId]);

  // Cleanup subscription and polling on unmount
  useEffect(() => {
    return () => {
      syncRef.current?.stopSubscription();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  return {
    gameState,
    playerRack,
    isMyTurn,
    isLoading,
    error,
    lastEventId,
    createGame,
    loadGame,
    makeMove,
    pass,
    exchange,
    resign,
    deleteGame,
    validateMove: validateMoveAction,
  };
}

export default useGame;
