import { NDKEvent, NDKFilter } from "@nostr-dev-kit/ndk";
import type { GameState, PlayerRack } from "../types/game";
import {
  GAME_KIND,
  GAME_D_TAG_PREFIX,
  RACK_D_TAG_PREFIX,
  DecryptedGameEvent,
} from "../types/nostr";
import {
  getCurrentUser,
  fetchEvents,
  publishEvent,
  createEvent,
  subscribeToEvents,
} from "./client";
import {
  encryptGameState,
  decryptGameState,
  encryptToSelf,
  decryptFromSelf,
} from "./encryption";

/**
 * NostrSync - Handles game state synchronization via Nostr relays
 */
export class NostrSync {
  private gameId: string;
  private opponentPubkey: string;
  private unsubscribe: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatMs: number | null = null;
  private subscriptionCallbacks: {
    onUpdate: (event: DecryptedGameEvent) => void;
    onError?: (error: Error) => void;
  } | null = null;

  constructor(gameId: string, opponentPubkey: string) {
    this.gameId = gameId;
    this.opponentPubkey = opponentPubkey;
  }

  /**
   * Get the d-tag for game state events
   */
  private getGameDTag(): string {
    return `${GAME_D_TAG_PREFIX}${this.gameId}`;
  }

  /**
   * Get the d-tag for player rack events
   */
  private getRackDTag(): string {
    return `${RACK_D_TAG_PREFIX}${this.gameId}`;
  }

  /**
   * Fetch the latest game state from relays
   */
  async fetchLatestGameState(): Promise<DecryptedGameEvent | null> {
    const user = getCurrentUser();
    if (!user?.pubkey) {
      throw new Error("Must be logged in to fetch game state");
    }

    const filter: NDKFilter = {
      kinds: [GAME_KIND],
      "#d": [this.getGameDTag()],
    };

    const events = await fetchEvents(filter);

    if (events.length === 0) {
      return null;
    }

    // Sort by created_at descending to get the most recent
    const sorted = events.sort(
      (a, b) => (b.created_at || 0) - (a.created_at || 0),
    );

    // Try to decrypt each event starting from most recent
    for (const event of sorted) {
      try {
        const senderPubkey = event.pubkey;
        // Determine the other party for decryption
        const decryptKey =
          senderPubkey === user.pubkey ? this.opponentPubkey : senderPubkey;

        const state = await decryptGameState<GameState>(
          decryptKey,
          event.content,
        );

        return {
          event: {
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at || 0,
            kind: GAME_KIND,
            tags: event.tags,
            content: event.content,
            sig: event.sig || "",
          },
          state,
        };
      } catch (err) {
        // Failed to decrypt, try next event
        console.warn("Failed to decrypt event:", event.id, err);
        continue;
      }
    }

    return null;
  }

  /**
   * Publish a new game state
   */
  async publishGameState(
    state: GameState,
    _previousEventId: string,
  ): Promise<string> {
    const user = getCurrentUser();
    if (!user?.pubkey) {
      throw new Error("Must be logged in to publish game state");
    }

    // Encrypt the state for the opponent
    const encryptedContent = await encryptGameState(this.opponentPubkey, state);

    // Create the event with proper tags
    const event = createEvent(GAME_KIND, encryptedContent, [
      ["d", this.getGameDTag()],
      ["p", state.meta.playerOne],
      ["p", state.meta.playerTwo],
    ]);

    await publishEvent(event);

    return event.id;
  }

  /**
   * Fetch player's rack from relays
   */
  async fetchPlayerRack(): Promise<PlayerRack | null> {
    const user = getCurrentUser();
    if (!user?.pubkey) {
      throw new Error("Must be logged in to fetch rack");
    }

    const filter: NDKFilter = {
      kinds: [GAME_KIND],
      authors: [user.pubkey],
      "#d": [this.getRackDTag()],
    };

    const events = await fetchEvents(filter);

    if (events.length === 0) {
      return null;
    }

    // Get the most recent
    const sorted = events.sort(
      (a, b) => (b.created_at || 0) - (a.created_at || 0),
    );
    const latest = sorted[0];

    try {
      return await decryptFromSelf<PlayerRack>(latest.content);
    } catch (err) {
      console.error("Failed to decrypt rack:", err);
      return null;
    }
  }

  /**
   * Save player's rack to relays (encrypted to self)
   */
  async savePlayerRack(rack: PlayerRack): Promise<void> {
    const user = getCurrentUser();
    if (!user?.pubkey) {
      throw new Error("Must be logged in to save rack");
    }

    const encryptedContent = await encryptToSelf(rack);

    const event = createEvent(GAME_KIND, encryptedContent, [
      ["d", this.getRackDTag()],
    ]);

    await publishEvent(event);
  }

  /**
   * Publish NIP-09 deletion events for this game (creator's events only)
   */
  async publishDeletionForGame(reason: string = "Game deleted"): Promise<void> {
    const user = getCurrentUser();
    if (!user?.pubkey) {
      throw new Error("Must be logged in to delete game");
    }

    const dTag = this.getGameDTag();
    const events = await fetchEvents({
      kinds: [GAME_KIND],
      authors: [user.pubkey],
      "#d": [dTag],
      limit: 50,
    });

    if (events.length === 0) return;

    const tags: string[][] = events.map((event) => ["e", event.id]);
    tags.push(["a", `${GAME_KIND}:${user.pubkey}:${dTag}`]);
    tags.push(["k", GAME_KIND.toString()]);

    const deletionEvent = createEvent(5, reason, tags);
    await publishEvent(deletionEvent);
  }

  /**
   * Subscribe to game state updates
   */
  subscribeToGameUpdates(
    onUpdate: (event: DecryptedGameEvent) => void,
    onError?: (error: Error) => void,
    options?: { heartbeatMs?: number },
  ): void {
    this.subscriptionCallbacks = { onUpdate, onError };
    this.heartbeatMs = options?.heartbeatMs ?? null;
    this.startSubscription();
    this.startHeartbeat();
  }

  private startSubscription(): void {
    const user = getCurrentUser();
    if (!user?.pubkey) {
      this.subscriptionCallbacks?.onError?.(
        new Error("Must be logged in to subscribe"),
      );
      return;
    }

    const filter: NDKFilter = {
      kinds: [GAME_KIND],
      "#d": [this.getGameDTag()],
      since: Math.floor(Date.now() / 1000) - 60, // Last minute
    };

    const { unsubscribe } = subscribeToEvents(
      filter,
      async (event: NDKEvent) => {
        try {
          const senderPubkey = event.pubkey;
          const decryptKey =
            senderPubkey === user.pubkey ? this.opponentPubkey : senderPubkey;

          const state = await decryptGameState<GameState>(
            decryptKey,
            event.content,
          );

          this.subscriptionCallbacks?.onUpdate({
            event: {
              id: event.id,
              pubkey: event.pubkey,
              created_at: event.created_at || 0,
              kind: GAME_KIND,
              tags: event.tags,
              content: event.content,
              sig: event.sig || "",
            },
            state,
          });
        } catch (err) {
          this.subscriptionCallbacks?.onError?.(err as Error);
        }
      },
    );

    this.unsubscribe = unsubscribe;
  }

  private startHeartbeat(): void {
    if (!this.heartbeatMs || this.heartbeatMs <= 0) return;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = setInterval(() => {
      if (!this.subscriptionCallbacks) return;
      this.unsubscribeOnly();
      this.startSubscription();
    }, this.heartbeatMs);
  }

  private unsubscribeOnly(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Stop listening for updates
   */
  stopSubscription(): void {
    this.unsubscribeOnly();
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Validate an incoming state update
   */
  validateStateUpdate(
    currentState: GameState,
    newEvent: DecryptedGameEvent,
    expectedPreviousEventId: string,
  ): { valid: boolean; error?: string } {
    const newState = newEvent.state;

    // Check turn index increments by exactly 1
    if (newState.turn.index !== currentState.turn.index + 1) {
      return {
        valid: false,
        error: `Invalid turn index: expected ${currentState.turn.index + 1}, got ${newState.turn.index}`,
      };
    }

    // Check lastMoveHash matches previous event
    if (newState.turn.lastMoveHash !== expectedPreviousEventId) {
      return {
        valid: false,
        error: `Invalid lastMoveHash: expected ${expectedPreviousEventId}, got ${newState.turn.lastMoveHash}`,
      };
    }

    // Check it was the active player's turn
    if (newEvent.event.pubkey !== currentState.turn.activePlayer) {
      return {
        valid: false,
        error: `Wrong player: expected ${currentState.turn.activePlayer}, got ${newEvent.event.pubkey}`,
      };
    }

    return { valid: true };
  }

  /**
   * Create initial game state and publish
   */
  static async createGame(
    playerOne: string,
    playerTwo: string,
  ): Promise<{ gameId: string; state: GameState }> {
    // Import here to avoid circular dependency
    const { GameEngine } = await import("../engine/GameEngine");

    const state = GameEngine.initializeGame(playerOne, playerTwo);

    const sync = new NostrSync(state.meta.gameId, playerTwo);
    await sync.publishGameState(state, "");

    return { gameId: state.meta.gameId, state };
  }

  /**
   * List games for the current user
   */
  static async listUserGames(): Promise<DecryptedGameEvent[]> {
    const user = getCurrentUser();
    if (!user?.pubkey) {
      throw new Error("Must be logged in to list games");
    }

    // Fetch games where user is tagged
    const filter: NDKFilter = {
      kinds: [GAME_KIND],
      "#p": [user.pubkey],
      "#d": [], // Will match any d-tag starting with our prefix
    };

    const events = await fetchEvents(filter);

    // Filter to only game state events (not racks)
    const gameEvents = events.filter((e) => {
      const dTag = e.tags.find((t) => t[0] === "d")?.[1];
      return dTag?.startsWith(GAME_D_TAG_PREFIX);
    });

    // Group by game ID and get latest for each
    const gameMap = new Map<string, NDKEvent>();
    for (const event of gameEvents) {
      const dTag = event.tags.find((t) => t[0] === "d")?.[1];
      if (!dTag) continue;

      const existing = gameMap.get(dTag);
      if (!existing || (event.created_at || 0) > (existing.created_at || 0)) {
        gameMap.set(dTag, event);
      }
    }

    // Decrypt and return
    const results: DecryptedGameEvent[] = [];
    for (const event of gameMap.values()) {
      try {
        // Find opponent pubkey from p tags
        const pTags = event.tags.filter((t) => t[0] === "p").map((t) => t[1]);
        const opponentPubkey = pTags.find((p) => p !== user.pubkey) || pTags[0];

        const decryptKey =
          event.pubkey === user.pubkey ? opponentPubkey : event.pubkey;
        const state = await decryptGameState<GameState>(
          decryptKey,
          event.content,
        );

        results.push({
          event: {
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at || 0,
            kind: GAME_KIND,
            tags: event.tags,
            content: event.content,
            sig: event.sig || "",
          },
          state,
        });
      } catch (err) {
        console.warn("Failed to decrypt game event:", event.id, err);
      }
    }

    return results;
  }
}

export default NostrSync;
