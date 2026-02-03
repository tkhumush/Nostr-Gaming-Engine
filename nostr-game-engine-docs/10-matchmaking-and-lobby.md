# Matchmaking and Lobby

## Purpose

Enable players to find opponents, create games, and manage their active game sessions. The platform uses a simple direct-challenge model where players explicitly invite each other.

## Current Implementation

### File: `src/components/Lobby.tsx`

### Matchmaking Model

The platform uses **direct challenge** matchmaking:

```
┌─────────────────┐         ┌─────────────────┐
│    Player A     │         │    Player B     │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │  1. Search for opponent   │
         │     (by npub, NIP-05,    │
         │      or name search)      │
         ▼                           │
┌─────────────────┐                  │
│ Create Game     │                  │
│ • Generate UUID │                  │
│ • Initialize    │                  │
│ • Publish to    │                  │
│   Nostr relays  │                  │
└────────┬────────┘                  │
         │                           │
         │  2. Share game link       │
         │     (or opponent sees     │
         │      in their lobby)      │
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────┐
│              Nostr Relays                   │
│  Kind 30078 event with #p tags for both    │
│  players enables automatic discovery        │
└─────────────────────────────────────────────┘
```

### Opponent Search

```typescript
// src/components/OpponentSearch.tsx
interface OpponentSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (profile: NostrProfile) => void;
}

// Search methods:
// 1. Direct npub entry: npub1abc...
// 2. NIP-05 identifier: user@domain.com
// 3. Hex pubkey: abc123...
// 4. Name search via search relays
```

### Game Discovery

Players automatically see games where they're tagged:

```typescript
// src/components/Lobby.tsx:74-94
useEffect(() => {
  if (!user?.pubkey) return;

  // Subscribe to games where this user is a participant
  const subscription = subscribeToEvents(
    { kinds: [GAME_KIND], "#p": [user.pubkey] },
    () => scheduleRefresh(),  // Refresh list when new game arrives
  );

  // Also poll every 30 seconds as backup
  const intervalId = window.setInterval(() => {
    loadGames();
  }, 30000);

  return () => {
    subscription.unsubscribe();
    window.clearInterval(intervalId);
  };
}, [user?.pubkey]);
```

### Game List Fetching

```typescript
// src/nostr/games.ts:28-79
export async function fetchUserGames(pubkey: string): Promise<GameSummary[]> {
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#p": [pubkey],  // Games where user is tagged
  });

  // Deduplicate by game ID (keep latest event)
  const gameMap = new Map<string, NDKEvent>();
  for (const event of events) {
    const dTag = event.tags.find((t) => t[0] === "d")?.[1];
    if (!dTag?.startsWith(GAME_D_TAG_PREFIX)) continue;

    const gameId = dTag.replace(GAME_D_TAG_PREFIX, "");
    const existing = gameMap.get(gameId);

    if (!existing || (event.created_at || 0) > (existing.created_at || 0)) {
      gameMap.set(gameId, event);
    }
  }

  // Decrypt and parse each game's state
  const games: GameSummary[] = [];
  for (const [gameId, event] of gameMap) {
    try {
      const decrypted = await decryptContent(/* ... */);
      const state = JSON.parse(decrypted);

      games.push({
        gameId,
        opponentPubkey: getOpponent(state, pubkey),
        status: state.meta.status,
        activePlayer: state.turn.activePlayer,
        lastUpdated: event.created_at,
        p1Score: state.scoring?.p1Score,
        p2Score: state.scoring?.p2Score,
      });
    } catch {
      // Skip games that can't be decrypted
    }
  }

  return games.sort((a, b) => b.lastUpdated - a.lastUpdated);
}
```

### Game Summary Type

```typescript
// src/nostr/games.ts
export interface GameSummary {
  gameId: string;
  opponentPubkey: string;
  status: 'active' | 'completed' | 'abandoned' | 'deleted';
  activePlayer: string;
  lastUpdated: number;
  players: string[];
  playerOne?: string;
  creatorPubkey?: string;
  p1Score?: number;
  p2Score?: number;
}
```

### Creating a Game

```typescript
// src/components/Lobby.tsx:152-176
const handleCreateGame = useCallback(async () => {
  const pubkey = selectedOpponent?.pubkey || normalizePubkey(opponentInput);

  if (!pubkey) {
    setError("Select an opponent or enter a valid npub");
    return;
  }

  if (pubkey === user?.pubkey) {
    setError("Cannot play against yourself");
    return;
  }

  setIsCreating(true);
  try {
    const gameId = await createGame(pubkey);  // From useGame hook
    onGameStart(gameId, pubkey);
  } catch (err) {
    setError(err.message);
  } finally {
    setIsCreating(false);
  }
}, [/* deps */]);
```

### Joining via Link

Games can be joined via direct link:

```typescript
// URL format: https://yourgame.com/?game=<gameId>&opponent=<pubkey>

// src/components/Lobby.tsx:178-191
const handleJoinGame = useCallback(() => {
  if (!joinGameId.trim() || !joinOpponent.trim()) {
    setError("Enter both game ID and opponent");
    return;
  }

  const pubkey = normalizePubkey(joinOpponent);
  if (!pubkey) {
    setError("Invalid opponent pubkey");
    return;
  }

  onGameStart(joinGameId.trim(), pubkey);
}, [joinGameId, joinOpponent, onGameStart]);
```

### Game Card Display

```typescript
// Lobby UI shows:
// - Opponent avatar and name
// - Turn indicator ("Your turn" / "Waiting")
// - Score preview
// - Game status (active/completed/deleted)

<div className={`game-card ${ended ? "ended" : ""} ${myTurn ? "my-turn" : ""}`}>
  <div className="opponent-avatar-wrapper">
    <img src={profile.picture} />
  </div>
  <div className="game-info">
    <span className="opponent-name">{displayName}</span>
    <span className="turn-badge">{myTurn ? "Your turn" : "Waiting"}</span>
    <span className="game-score">{myScore} – {opponentScore}</span>
  </div>
</div>
```

## Game-Agnostic Interface

```typescript
interface LobbyProvider {
  // Game discovery
  fetchUserGames(pubkey: string): Promise<GameSummary[]>;
  subscribeToNewGames(pubkey: string, onGame: (game: GameSummary) => void): () => void;

  // Game creation
  createGame(opponentPubkey: string): Promise<string>;  // Returns gameId

  // Opponent search
  searchOpponents(query: string): Promise<NostrProfile[]>;
  resolveOpponent(input: string): Promise<string | null>;  // npub/NIP-05 -> hex

  // Game management
  deleteGame(gameId: string): Promise<void>;
  abandonGame(gameId: string): Promise<void>;
}
```

## Alternative Matchmaking Models

The current implementation uses direct challenge, but the platform could support:

### 1. Open Challenge Pool

```typescript
// Post a "looking for game" event
const challenge = createEvent(CHALLENGE_KIND, JSON.stringify({
  game: "chess",
  timeControl: "5+0",
  rating: 1500,
}), [
  ["d", `challenge:${myPubkey}`],
  ["t", "chess"],
  ["t", "blitz"],
]);

// Others can query and accept
const challenges = await fetchEvents({
  kinds: [CHALLENGE_KIND],
  "#t": ["chess"],
});
```

### 2. Matchmaking Queue

```typescript
// Central relay-based queue (requires trusted relay)
const joinQueue = createEvent(QUEUE_KIND, JSON.stringify({
  game: "chess",
  skill: "intermediate",
  timestamp: Date.now(),
}));

// Relay matches players and notifies both
```

### 3. Tournament Brackets

```typescript
// Tournament organizer creates bracket
const tournament = {
  id: uuidv4(),
  format: "single-elimination",
  players: [pubkey1, pubkey2, pubkey3, pubkey4],
  rounds: [/* bracket structure */],
};
```

## Reuse Guidance for New Games

1. **Copy the Lobby component** as a starting point

2. **Update game-specific display**:
   ```typescript
   // Instead of Scrabble scores
   const getScorePreview = (game: ChessSummary) => {
     return {
       material: game.materialBalance,
       moveCount: game.moveHistory.length,
     };
   };
   ```

3. **Customize turn indicator**:
   ```typescript
   // Chess: "White to move" / "Black to move"
   const turnLabel = isWhite ? "White to move" : "Black to move";
   ```

4. **Add game-specific filters**:
   ```typescript
   // Filter by time control, variant, etc.
   const [filter, setFilter] = useState<'all' | 'rapid' | 'blitz'>('all');
   const filteredGames = games.filter(g => filter === 'all' || g.timeControl === filter);
   ```

5. **Handle game-specific invites**:
   ```typescript
   // Chess might include time control in invite
   const createGame = async (opponent: string, options: { timeControl: string }) => {
     const state = ChessEngine.initializeGame(myPubkey, opponent, options);
     // ...
   };
   ```

## Dependencies

- `src/nostr/client.ts` - Event subscriptions
- `src/nostr/games.ts` - Game fetching
- `src/nostr/profiles.ts` - Opponent profile display
- `src/hooks/useGame.ts` - Game creation

## UI Components

| Component | Purpose |
|-----------|---------|
| `Lobby.tsx` | Main lobby view |
| `OpponentSearch.tsx` | Search/select opponent |
| `GameCard` (inline) | Individual game display |

## Discovery Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        GAME DISCOVERY                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User opens app                                                 │
│       │                                                         │
│       ▼                                                         │
│  fetchUserGames(myPubkey)                                       │
│       │                                                         │
│       ▼                                                         │
│  Query: { kinds: [30078], "#p": [myPubkey] }                   │
│       │                                                         │
│       ▼                                                         │
│  For each event:                                                │
│    1. Extract gameId from d-tag                                 │
│    2. Decrypt content                                           │
│    3. Parse game state                                          │
│    4. Determine opponent, status, whose turn                    │
│       │                                                         │
│       ▼                                                         │
│  Display sorted list (most recent first)                        │
│       │                                                         │
│       ▼                                                         │
│  Subscribe for real-time updates                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
