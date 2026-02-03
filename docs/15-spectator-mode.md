# Spectator Mode (Proposal)

> **Status**: Proposal - Not yet implemented

This document outlines a proposed design for allowing spectators to watch games in real-time.

## Overview

Spectator mode enables users who are not playing to watch a game as it unfolds. This is valuable for:

- **Tournaments** - Audiences watching competitive matches
- **Learning** - New players observing experienced players
- **Social** - Friends watching each other's games
- **Streaming** - Content creators broadcasting games

## Design Challenges

### 1. Privacy vs Visibility

The current implementation encrypts all game state between the two players using NIP-44. Spectators cannot decrypt this data.

**Options:**

| Approach | Pros | Cons |
|----------|------|------|
| Public games | Simple, anyone can watch | No privacy, opponents can peek |
| Spectator keys | Controlled access | Key distribution complexity |
| Delayed broadcast | Privacy preserved | Not real-time |
| Separate spectator events | Clean separation | Double the events |

### 2. Hidden Information

Many games have hidden information (cards in hand, tiles on rack). Spectators should see:

- **Board state** - Public game position
- **Move history** - What moves were played
- **Scores** - Current standings

But NOT see:
- Player hands/racks
- Deck/bag contents
- Private player data

## Proposed Architecture

### Option A: Dual-Event Model

Players publish two events per move:

```
┌─────────────────────────────────────────────────────────────┐
│                        Player Move                          │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│   Private Game Event    │     │   Public Spectator Event    │
│   Kind: 30078           │     │   Kind: 30079 (new)         │
│   Encrypted: NIP-44     │     │   Encrypted: No             │
│   Contains: Full state  │     │   Contains: Public state    │
│   Audience: Players     │     │   Audience: Anyone          │
└─────────────────────────┘     └─────────────────────────────┘
```

**Event Structure (Kind 30079):**

```json
{
  "kind": 30079,
  "tags": [
    ["d", "game_v1_{gameId}_spectator"],
    ["g", "{gameId}"],
    ["p", "{playerOnePubkey}"],
    ["p", "{playerTwoPubkey}"],
    ["spectatable", "true"]
  ],
  "content": {
    "board": [...],
    "scores": { "p1": 150, "p2": 120 },
    "turn": { "index": 15, "activePlayer": "..." },
    "lastMove": { "description": "Played QUIZ for 22 points" },
    "status": "in_progress"
  }
}
```

### Option B: Spectator Key Sharing

Game creator generates a symmetric "spectator key" and shares it:

```typescript
interface SpectatorAccess {
  gameId: string;
  spectatorKey: string;  // Symmetric key for spectator events
  shareUrl: string;      // URL with embedded key
}

// Generate spectator access
function enableSpectators(gameId: string): SpectatorAccess {
  const spectatorKey = generateSymmetricKey();
  return {
    gameId,
    spectatorKey,
    shareUrl: `https://game.app/watch/${gameId}?key=${spectatorKey}`
  };
}
```

Events are encrypted with this spectator key instead of being public:

```json
{
  "kind": 30079,
  "tags": [
    ["d", "game_v1_{gameId}_spectator"],
    ["encryption", "symmetric"]
  ],
  "content": "<encrypted with spectator key>"
}
```

### Option C: Delayed Public Broadcast

Game state is published publicly, but with a configurable delay:

```typescript
interface DelayedBroadcast {
  delaySeconds: number;  // e.g., 300 = 5 minutes
  gameId: string;
}

// In NostrSync
async publishWithSpectatorDelay(
  state: GameState,
  delay: number
): Promise<void> {
  // Publish private event immediately
  await this.publishGameState(state, previousEventId);

  // Schedule public event
  setTimeout(() => {
    this.publishSpectatorState(state);
  }, delay * 1000);
}
```

## Recommended Approach

We recommend **Option A (Dual-Event Model)** with an opt-in flag:

### 1. Game Creation

```typescript
interface GameOptions {
  spectatable: boolean;  // Default: false
}

function createGame(
  opponentPubkey: string,
  options: GameOptions
): GameState {
  return {
    meta: {
      gameId: uuid(),
      spectatable: options.spectatable,
      // ...
    },
    // ...
  };
}
```

### 2. Publishing Moves

```typescript
class NostrSync {
  async publishGameState(
    state: GameState,
    previousEventId?: string
  ): Promise<string> {
    // Always publish encrypted player event
    const eventId = await this.publishPrivateState(state, previousEventId);

    // If spectatable, also publish public event
    if (state.meta.spectatable) {
      await this.publishSpectatorState(state);
    }

    return eventId;
  }

  private async publishSpectatorState(state: GameState): Promise<void> {
    const publicState = this.stripPrivateData(state);

    const event = {
      kind: 30079,
      tags: [
        ["d", `game_v1_${state.meta.gameId}_spectator`],
        ["g", state.meta.gameId],
        ["p", state.meta.playerOne],
        ["p", state.meta.playerTwo],
      ],
      content: JSON.stringify(publicState),
    };

    await publishEvent(event);
  }

  private stripPrivateData(state: GameState): PublicGameState {
    // Remove hidden information
    const { playerOneRack, playerTwoRack, tileBag, ...publicState } = state;
    return publicState;
  }
}
```

### 3. Spectator Subscription

```typescript
class SpectatorSync {
  constructor(private gameId: string) {}

  subscribe(callback: (state: PublicGameState) => void): void {
    subscribeToEvents(
      {
        kinds: [30079],
        "#g": [this.gameId],
      },
      (event) => {
        const state = JSON.parse(event.content);
        callback(state);
      }
    );
  }
}
```

### 4. Spectator UI Component

```typescript
function SpectatorView({ gameId }: { gameId: string }) {
  const [state, setState] = useState<PublicGameState | null>(null);
  const [spectatorCount, setSpectatorCount] = useState(0);

  useEffect(() => {
    const sync = new SpectatorSync(gameId);
    sync.subscribe(setState);

    // Optional: track spectator count
    announceSpectator(gameId);

    return () => sync.unsubscribe();
  }, [gameId]);

  if (!state) return <div>Loading game...</div>;

  return (
    <div className="spectator-view">
      <div className="spectator-badge">
        Watching ({spectatorCount} spectators)
      </div>
      <Board state={state.board} readonly />
      <ScoreBoard scores={state.scores} />
      <MoveHistory moves={state.moveHistory} />
    </div>
  );
}
```

## Spectator Count (Optional)

Track how many people are watching:

```typescript
// Kind 30080: Spectator presence
{
  "kind": 30080,
  "tags": [
    ["d", `spectator_${gameId}_${myPubkey}`],
    ["g", gameId],
    ["expiration", (now + 60).toString()]  // NIP-40 expiration
  ],
  "content": ""
}
```

Games can query spectator count:

```typescript
async function getSpectatorCount(gameId: string): Promise<number> {
  const events = await fetchEvents({
    kinds: [30080],
    "#g": [gameId],
    since: Math.floor(Date.now() / 1000) - 120,  // Last 2 minutes
  });

  const uniqueSpectators = new Set(events.map(e => e.pubkey));
  return uniqueSpectators.size;
}
```

## Spectator Chat (Optional)

Allow spectators to chat during games:

```typescript
// Kind 42: Channel message (NIP-28)
{
  "kind": 42,
  "tags": [
    ["e", channelCreateEventId, relayUrl, "root"],
    ["g", gameId]
  ],
  "content": "Great move!"
}
```

## Security Considerations

1. **Information Leakage** - Ensure private data is never included in spectator events
2. **Timing Attacks** - Spectator events should be published atomically with private events
3. **Spam Prevention** - Consider rate limiting spectator presence announcements
4. **Game Integrity** - Spectators must not be able to communicate with players during play

## Migration Path

1. Add `spectatable` flag to GameMeta interface
2. Implement `publishSpectatorState` in NostrSync
3. Create SpectatorSync class
4. Build SpectatorView component
5. Add spectator toggle to game creation UI

## Open Questions

1. Should spectators be able to tip/zap players during the game?
2. How do we handle spectator mode for games with asymmetric information (poker)?
3. Should there be a "commentator" role with special privileges?
4. How do we prevent spectators from communicating with players (coaching)?
