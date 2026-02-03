# Game Session Storage

## Purpose

Store and retrieve game state using Nostr Kind 30078 (NIP-78) replaceable events. This allows game state to persist across sessions and be synchronized between players.

## Current Implementation

### File: `src/nostr/NostrSync.ts`

### Event Kind and Tags

```typescript
// src/types/nostr.ts:46-48
export const GAME_KIND = 30078;
export const GAME_D_TAG_PREFIX = "wordswithzaps_v1_";
export const RACK_D_TAG_PREFIX = "wordswithzaps_rack_";
```

### NIP-78 Replaceable Events

Kind 30078 is a **parameterized replaceable event**. This means:
- Events are identified by `kind:pubkey:d-tag` (not event ID)
- Publishing a new event with the same d-tag **replaces** the previous one
- Relays only keep the latest version

This is perfect for game state because:
1. Only the current state matters (not history)
2. Storage is efficient (one event per game per player)
3. Updates are atomic

### Creating a Game

```typescript
// src/nostr/NostrSync.ts:33-66
static async createGame(
  playerOnePubkey: string,
  playerTwoPubkey: string,
): Promise<{ gameId: string; state: GameState }> {
  // Initialize game state with game engine
  const state = GameEngine.initializeGame(playerOnePubkey, playerTwoPubkey);
  const gameId = state.meta.gameId;

  // Encrypt for opponent
  const plaintext = JSON.stringify(state);
  const encrypted = await encryptContent(playerTwoPubkey, plaintext);

  // Create the event with d-tag for replaceability
  const event = createEvent(GAME_KIND, encrypted, [
    ["d", `${GAME_D_TAG_PREFIX}${gameId}`],
    ["p", playerOnePubkey],
    ["p", playerTwoPubkey],
  ]);

  await publishEvent(event);

  return { gameId, state };
}
```

### D-Tag Structure

```
wordswithzaps_v1_<uuid>     → Game state
wordswithzaps_rack_<uuid>   → Player's private rack
```

The d-tag uniquely identifies the game and allows:
- Fetching by game ID
- Listing all games for a player
- Replacing state without creating duplicates

### Publishing Game State Updates

```typescript
// src/nostr/NostrSync.ts:89-119
async publishGameState(
  state: GameState,
  previousEventId: string,
): Promise<string> {
  const user = getCurrentUser();

  const plaintext = JSON.stringify(state);
  const encryptedContent = await encryptContent(
    this.opponentPubkey,
    plaintext,
  );

  const event = createEvent(GAME_KIND, encryptedContent, [
    ["d", this.getGameDTag()],       // Same d-tag = replaces old event
    ["p", user.pubkey],
    ["p", this.opponentPubkey],
  ]);

  await publishEvent(event);
  return event.id!;
}
```

### Fetching Latest Game State

```typescript
// src/nostr/NostrSync.ts:136-172
async fetchLatestGameState(): Promise<DecryptedGameEvent | null> {
  const user = getCurrentUser();

  // Query by d-tag to get the current state
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#d": [this.getGameDTag()],
    limit: 1,
  });

  if (events.length === 0) {
    return null;
  }

  // Get the most recent event
  const event = events.sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0),
  )[0];

  // Decrypt based on who published
  const decryptKey =
    event.pubkey === user.pubkey ? this.opponentPubkey : event.pubkey;

  const plaintext = await decryptContent(decryptKey, event.content);
  const state: GameState = JSON.parse(plaintext);

  return { event: event as GameEvent, state };
}
```

### Private Player State (Rack)

Each player stores their private state (tiles in hand) separately:

```typescript
// src/nostr/NostrSync.ts:178-196
async savePlayerRack(rack: PlayerRack): Promise<void> {
  const user = getCurrentUser();

  // Encrypt rack for opponent (ensures both can decrypt)
  const plaintext = JSON.stringify(rack);
  const encryptedContent = await encryptContent(
    this.opponentPubkey,
    plaintext,
  );

  const event = createEvent(GAME_KIND, encryptedContent, [
    ["d", `${RACK_D_TAG_PREFIX}${this.gameId}`],  // Different prefix!
    ["p", user.pubkey],
  ]);

  await publishEvent(event);
}

async fetchPlayerRack(): Promise<PlayerRack | null> {
  const user = getCurrentUser();

  const events = await fetchEvents({
    kinds: [GAME_KIND],
    authors: [user.pubkey],  // Only my rack events
    "#d": [`${RACK_D_TAG_PREFIX}${this.gameId}`],
    limit: 1,
  });

  // Decrypt and return...
}
```

### Listing All Games

```typescript
// src/nostr/games.ts:28-79
export async function fetchUserGames(pubkey: string): Promise<GameListItem[]> {
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#p": [pubkey],  // Games where this pubkey is a participant
  });

  const gameMap = new Map<string, NDKEvent>();

  for (const event of events) {
    const dTag = event.tags.find((t) => t[0] === "d")?.[1];
    if (!dTag?.startsWith(GAME_D_TAG_PREFIX)) continue;

    const gameId = dTag.replace(GAME_D_TAG_PREFIX, "");
    const existing = gameMap.get(gameId);

    // Keep most recent event for each game
    if (!existing || (event.created_at || 0) > (existing.created_at || 0)) {
      gameMap.set(gameId, event);
    }
  }

  const games: GameListItem[] = [];
  for (const [gameId, event] of gameMap) {
    const opponent = event.tags
      .filter((t) => t[0] === "p")
      .map((t) => t[1])
      .find((p) => p !== pubkey);

    games.push({
      gameId,
      opponentPubkey: opponent || "",
      lastUpdated: event.created_at || 0,
      myTurn: /* determined by decrypting state */,
    });
  }

  return games.sort((a, b) => b.lastUpdated - a.lastUpdated);
}
```

## Event Storage Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          NOSTR RELAYS                                      │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Game State Event (Kind 30078)                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ d-tag: "wordswithzaps_v1_<game-uuid>"                                │  │
│  │ pubkey: <last-player-to-move>                                        │  │
│  │ tags: ["p", player1], ["p", player2]                                 │  │
│  │ content: <NIP-44 encrypted JSON of GameState>                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  Player 1 Rack (Kind 30078)                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ d-tag: "wordswithzaps_rack_<game-uuid>"                              │  │
│  │ author: player1                                                       │  │
│  │ content: <NIP-44 encrypted JSON of { rack: [...] }>                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  Player 2 Rack (Kind 30078)                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ d-tag: "wordswithzaps_rack_<game-uuid>"                              │  │
│  │ author: player2                                                       │  │
│  │ content: <NIP-44 encrypted JSON of { rack: [...] }>                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Game-Agnostic Interface

```typescript
interface GameSessionStorage {
  // Create a new game session
  static createGame(
    player1: string,
    player2: string,
    initialState: GameState,
  ): Promise<{ gameId: string; state: GameState }>;

  // Publish updated game state (replaces previous)
  publishGameState(state: GameState, previousEventId: string): Promise<string>;

  // Fetch current game state
  fetchLatestGameState(): Promise<{ event: NDKEvent; state: GameState } | null>;

  // Private player state
  savePlayerPrivateState(data: unknown): Promise<void>;
  fetchPlayerPrivateState(): Promise<unknown | null>;

  // Listing
  static listUserGames(pubkey: string): Promise<GameListItem[]>;

  // Deletion
  deleteGame(): Promise<void>;
  publishDeletionForGame(reason?: string): Promise<void>;
}
```

## NIPs Used

| NIP | Purpose |
|-----|---------|
| NIP-78 | Application-specific data (Kind 30078) |
| NIP-33 | Parameterized replaceable events (d-tag) |
| NIP-09 | Event deletion requests |

## D-Tag Design Considerations

### Uniqueness
The d-tag must be unique per game:
```typescript
const gameId = uuidv4();  // UUID ensures uniqueness
const dTag = `yourgame_v1_${gameId}`;
```

### Versioning
Include a version in the prefix for future migrations:
```typescript
const GAME_D_TAG_PREFIX = "yourgame_v1_";  // v1 of your protocol
```

### Private State Separation
Use a different prefix for private data:
```typescript
const PUBLIC_PREFIX = "yourgame_v1_";     // Both players can see
const PRIVATE_PREFIX = "yourgame_hand_";  // Only author can see own
```

## Deletion

### Soft Delete (Set Status)

```typescript
// Mark game as deleted in state
const deletedState = {
  ...state,
  meta: { ...state.meta, status: "deleted", deletedBy: myPubkey },
};
await sync.publishGameState(deletedState, previousEventId);
```

### NIP-09 Deletion Request

```typescript
// src/nostr/NostrSync.ts:199-221
async publishDeletionForGame(reason: string = "Game deleted"): Promise<void> {
  const user = getCurrentUser();

  // Fetch all events for this game by this user
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    authors: [user.pubkey],
    "#d": [this.getGameDTag()],
  });

  // Create deletion request referencing all events
  const tags: string[][] = events.map((event) => ["e", event.id]);
  tags.push(["a", `${GAME_KIND}:${user.pubkey}:${this.getGameDTag()}`]);
  tags.push(["k", GAME_KIND.toString()]);

  const deletionEvent = createEvent(5, reason, tags);
  await publishEvent(deletionEvent);
}
```

## Reuse Guidance for New Games

1. **Define your d-tag prefixes**:
   ```typescript
   // src/types/nostr.ts
   export const GAME_D_TAG_PREFIX = "chess_v1_";
   export const PRIVATE_D_TAG_PREFIX = "chess_private_";
   ```

2. **Create the NostrSync adapter**:
   ```typescript
   class ChessSync {
     constructor(private gameId: string, private opponentPubkey: string) {}

     getGameDTag(): string {
       return `${GAME_D_TAG_PREFIX}${this.gameId}`;
     }

     async publishGameState(state: ChessState): Promise<string> {
       // Encrypt and publish as Kind 30078
     }
   }
   ```

3. **Handle private state** (if needed):
   - Chess: No private state (all pieces visible)
   - Poker: Hidden hands
   - Battleship: Hidden ship positions

4. **Query patterns**:
   ```typescript
   // All my games
   { kinds: [30078], "#p": [myPubkey] }

   // Specific game
   { kinds: [30078], "#d": [`chess_v1_${gameId}`] }

   // Games with specific opponent
   { kinds: [30078], "#p": [myPubkey], "#p": [opponentPubkey] }
   ```

5. **Event size limits**: Keep game state under 64KB to ensure relay acceptance. For large states, consider:
   - Storing only deltas
   - Using external storage with Nostr as pointer
   - Compressing state

## Dependencies

- `@nostr-dev-kit/ndk` - Event creation and publishing
- `uuid` - Game ID generation
