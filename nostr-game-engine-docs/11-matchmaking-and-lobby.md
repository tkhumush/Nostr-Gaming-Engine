# Matchmaking and Lobby

## Purpose

Enable players to find opponents, create games, and manage their active game sessions. The current implementation uses a simple **direct initiation** model.

## Current Implementation: Direct Initiation

The platform uses the simplest possible matchmaking: **Player A creates a game with Player B and makes the first move.** Player B discovers the game when it appears in their lobby (via `#p` tag subscription).

```
┌─────────────────┐                              ┌─────────────────┐
│    Player A     │                              │    Player B     │
└────────┬────────┘                              └────────┬────────┘
         │                                                │
         │  1. Search for opponent                        │
         │     (npub, NIP-05, or name)                   │
         ▼                                                │
┌─────────────────┐                                       │
│ Create Game     │                                       │
│ • Generate UUID │                                       │
│ • Initialize    │                                       │
│   game state    │                                       │
│ • MAKE FIRST    │                                       │
│   MOVE          │◄─── Key difference: game starts      │
│ • Publish to    │     immediately with first move      │
│   Nostr relays  │                                       │
└────────┬────────┘                                       │
         │                                                │
         │  2. Event published with                       │
         │     #p tags for both players                   │
         ▼                                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       NOSTR RELAYS                              │
│  Kind 30078 event tagged with both player pubkeys               │
└─────────────────────────────────────────────────────────────────┘
         │                                                │
         │                                                │  3. Player B's client
         │                                                │     subscribes to
         │                                                │     #p: [their pubkey]
         │                                                ▼
         │                                       ┌─────────────────┐
         │                                       │ Game appears    │
         │                                       │ in Player B's   │
         │                                       │ lobby           │
         │                                       └─────────────────┘
         │
         │  4. Optional: Send notification
         │     (Kind 1, Kind 4, or Zap)
         ▼
┌─────────────────┐
│ Notify opponent │
│ • Public note   │
│ • Private DM    │
│ • Zap nudge     │
└─────────────────┘
```

### Why This Approach?

**Pros:**
- Simple to implement
- No coordination required
- Works immediately
- No "pending invite" state to manage

**Cons:**
- Player B may not notice immediately
- No explicit "accept/decline" flow
- First move is committed before opponent agrees

**Suitable for:** Casual games where starting a game has low stakes (Scrabble, casual chess)

**May need enhancement for:** Rated games, tournaments, games with time controls, or games where the first move matters strategically

### Opponent Search

File: `src/components/OpponentSearch.tsx`

```typescript
// Search methods supported:
// 1. npub1... - Direct npub entry
// 2. user@domain.com - NIP-05 identifier
// 3. abc123... - Hex pubkey
// 4. "alice" - Name search via search relays
```

### Game Discovery

File: `src/components/Lobby.tsx`

```typescript
// Subscribe to games where user is tagged
useEffect(() => {
  if (!user?.pubkey) return;

  const subscription = subscribeToEvents(
    { kinds: [GAME_KIND], "#p": [user.pubkey] },
    () => scheduleRefresh(),
  );

  // Also poll every 30 seconds as backup
  const intervalId = window.setInterval(loadGames, 30000);

  return () => {
    subscription.unsubscribe();
    window.clearInterval(intervalId);
  };
}, [user?.pubkey]);
```

### Game List Fetching

File: `src/nostr/games.ts`

```typescript
export async function fetchUserGames(pubkey: string): Promise<GameSummary[]> {
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#p": [pubkey],
  });

  // Deduplicate by game ID, decrypt, parse
  // Return sorted by last updated
}
```

## Future Enhancement: Challenge/Accept Flow

For games requiring explicit acceptance (rated games, tournaments), consider:

```typescript
// New event kind for challenges
const CHALLENGE_KIND = 30079;

interface Challenge {
  challengerId: string;
  challengedId: string;
  gameType: string;
  options?: {
    timeControl?: string;
    rated?: boolean;
  };
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: number;
}

// Flow:
// 1. Player A creates challenge (Kind 30079, status: 'pending')
// 2. Player B sees pending challenges in lobby
// 3. Player B accepts → updates challenge status, creates game
// 4. Or Player B declines → updates challenge status
// 5. Or challenge expires after timeout
```

### Challenge Event Structure

```json
{
  "kind": 30079,
  "pubkey": "<challenger>",
  "content": "<encrypted challenge details>",
  "tags": [
    ["d", "challenge_<uuid>"],
    ["p", "<challenged_player>"],
    ["expiration", "<unix_timestamp>"]
  ]
}
```

## Future Enhancement: Open Challenge Pool

For finding random opponents:

```typescript
// Post open challenge
const openChallenge = createEvent(30079, JSON.stringify({
  gameType: "chess",
  timeControl: "5+0",
  rated: false,
}), [
  ["d", `open_challenge_${myPubkey}`],
  ["t", "chess"],
  ["t", "open-challenge"],
]);

// Others query open challenges
const challenges = await fetchEvents({
  kinds: [30079],
  "#t": ["open-challenge", "chess"],
});
```

## Lobby UI Components

### Game Card Display

```typescript
// Lobby shows:
// - Opponent avatar and name
// - Turn indicator
// - Score preview
// - Game status

<div className={`game-card ${myTurn ? "my-turn" : ""} ${ended ? "ended" : ""}`}>
  <img src={opponentPicture} className="opponent-avatar" />
  <div className="game-info">
    <span className="opponent-name">{opponentName}</span>
    <span className="turn-badge">{myTurn ? "Your turn" : "Waiting"}</span>
    <span className="game-score">{myScore} – {opponentScore}</span>
  </div>
</div>
```

### New Game Form

```typescript
<div className="new-game-section">
  <OpponentSearch
    value={opponentInput}
    onChange={setOpponentInput}
    onSelect={handleOpponentSelect}
  />

  <button onClick={handleCreateGame} disabled={!selectedOpponent}>
    Create Game
  </button>
</div>
```

## Game-Agnostic Interface

```typescript
interface MatchmakingProvider {
  // Current: Direct initiation
  createGame(opponentPubkey: string): Promise<string>;

  // Game discovery
  fetchUserGames(pubkey: string): Promise<GameSummary[]>;
  subscribeToNewGames(pubkey: string, callback: (game: GameSummary) => void): () => void;

  // Future: Challenge system
  createChallenge?(opponent: string, options?: ChallengeOptions): Promise<string>;
  acceptChallenge?(challengeId: string): Promise<string>;
  declineChallenge?(challengeId: string): Promise<void>;
  fetchPendingChallenges?(pubkey: string): Promise<Challenge[]>;

  // Future: Open matchmaking
  postOpenChallenge?(options: ChallengeOptions): Promise<string>;
  findOpenChallenges?(filters: ChallengeFilters): Promise<Challenge[]>;
}
```

## Reuse Guidance for New Games

### 1. For Casual Games (Like Scrabble)

Direct initiation works well:
```typescript
// Copy the current Lobby.tsx pattern
// User searches, selects opponent, creates game immediately
```

### 2. For Competitive Games (Rated Chess)

Add challenge/accept flow:
```typescript
// Extend with challenge events
const createChallenge = async (opponent: string, timeControl: string) => {
  const challenge = {
    type: 'challenge',
    opponent,
    timeControl,
    rated: true,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  };

  // Publish as Kind 30079 or custom kind
  // Wait for acceptance before creating actual game
};
```

### 3. For Quick Play (Random Opponent)

Add matchmaking queue:
```typescript
// This requires more infrastructure (trusted relay or coordinator)
const joinQueue = async (gameType: string) => {
  // Post "looking for game" event
  // Subscribe for match notifications
  // When matched, create game
};
```

### 4. For Tournaments

Build on challenge system:
```typescript
interface Tournament {
  id: string;
  organizer: string;
  players: string[];
  format: 'swiss' | 'elimination';
  rounds: TournamentRound[];
}

// Tournament organizer creates pairings
// Players receive challenges for each round
```

## Dependencies

- `src/nostr/client.ts` - Event subscriptions
- `src/nostr/games.ts` - Game fetching
- `src/nostr/profiles.ts` - Opponent profiles
- `src/components/OpponentSearch.tsx` - Search UI
