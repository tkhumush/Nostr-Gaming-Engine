# Extensibility

## Purpose

Document extension points and future enhancements for the Nostr Gaming Engine platform, including AI integration, spectator modes, tournaments, and cross-game features.

## Current Extension Points

### 1. Custom Event Kinds

The platform uses Kind 30078 for game state, but you can add custom event kinds:

```typescript
// Define additional event kinds for your game
export const EVENT_KINDS = {
  GAME_STATE: 30078,      // Standard game state
  GAME_CHAT: 30079,       // In-game chat (custom)
  GAME_EMOJI: 30080,      // Emoji reactions (custom)
  CHALLENGE: 30081,       // Open challenge pool (custom)
  TOURNAMENT: 30082,      // Tournament bracket (custom)
};
```

### 2. Zap Event Extensions

Customize zap content for different game events:

```typescript
// Different zap types
const zapTypes = {
  MOVE: "move",           // Standard move notification
  WIN: "win",             // Game victory celebration
  ACHIEVEMENT: "achieve", // Unlock achievement
  NUDGE: "nudge",         // Remind opponent to move
  TIP: "tip",             // Appreciation zap
};

// Include type in zap request content
const zapContent = JSON.stringify({
  type: zapTypes.WIN,
  gameId: gameId,
  message: "Checkmate! Great game!",
});
```

### 3. Profile Extensions

Store game-specific data in user profiles:

```typescript
// Custom tags in Kind 0 profile
const profileExtensions = {
  chess_rating: 1500,
  chess_games_played: 42,
  preferred_time_control: "5+0",
};
```

## Potential Extensions

### AI Integration

**Current Status**: No AI components implemented.

#### AI Opponent

```typescript
interface AIOpponent {
  pubkey: string;  // AI has its own Nostr identity
  generateMove(state: GameState, difficulty: string): Promise<Move>;
}

// AI opponent service
class ChessAI implements AIOpponent {
  pubkey = "ai_opponent_pubkey_hex";

  async generateMove(state: ChessState, difficulty: "easy" | "hard") {
    // Use Stockfish WASM or similar
    const engine = await loadStockfish();
    const bestMove = await engine.analyze(state.fen, { depth: difficulty === "easy" ? 5 : 15 });
    return bestMove;
  }
}
```

#### Move Suggestions

```typescript
interface MoveSuggester {
  suggestMoves(state: GameState, count: number): Promise<SuggestedMove[]>;
}

interface SuggestedMove {
  move: Move;
  score: number;
  reasoning?: string;
}
```

#### MCP Server for Claude Integration

```typescript
// Expose game state to Claude Desktop via MCP
const mcpServer = {
  tools: {
    "get_game_state": {
      description: "Get current game state",
      handler: async ({ gameId }) => {
        const state = await sync.fetchLatestGameState();
        return formatForAI(state);
      },
    },
    "get_valid_moves": {
      description: "List all legal moves",
      handler: async ({ gameId }) => {
        return engine.getAllValidMoves(state);
      },
    },
    "make_move": {
      description: "Play a move",
      handler: async ({ gameId, move }) => {
        // Validate and execute
      },
    },
  },
};
```

### Spectator Mode

Allow third parties to watch games:

```typescript
// Option 1: Public games (no encryption)
const publicGame = createEvent(GAME_KIND, JSON.stringify(state), [
  ["d", `chess_public_${gameId}`],
  ["p", player1],
  ["p", player2],
  ["t", "spectatable"],  // Tag for discovery
]);

// Option 2: Shared viewing key
const viewingKey = generateViewingKey();
const encryptedState = encryptWithKey(state, viewingKey);
// Share viewingKey with approved spectators

// Option 3: Delayed broadcast
// Publish unencrypted state 5 minutes after each move
setTimeout(() => {
  publishPublicState(state);
}, 5 * 60 * 1000);
```

### Tournament System

```typescript
interface Tournament {
  id: string;
  name: string;
  organizer: string;  // Pubkey
  format: "swiss" | "elimination" | "round-robin";
  players: string[];  // Pubkeys
  rounds: TournamentRound[];
  status: "registration" | "active" | "completed";
}

interface TournamentRound {
  roundNumber: number;
  pairings: Array<{
    white: string;
    black: string;
    gameId?: string;
    result?: "1-0" | "0-1" | "1/2-1/2";
  }>;
}

// Tournament events
const TOURNAMENT_KIND = 31000;  // Custom kind

// Create tournament
const tournament = createEvent(TOURNAMENT_KIND, JSON.stringify(tournamentData), [
  ["d", `tournament_${tournamentId}`],
  ["t", "chess-tournament"],
]);
```

### Cross-Game Features

#### Universal Player Stats

```typescript
// Store cross-game stats in profile or dedicated event
interface PlayerStats {
  pubkey: string;
  games: {
    chess: { played: number; won: number; rating: number };
    scrabble: { played: number; won: number; avgScore: number };
    go: { played: number; won: number; rank: string };
  };
  achievements: Achievement[];
  totalZapsSent: number;
  totalZapsReceived: number;
}
```

#### Achievement System

```typescript
interface Achievement {
  id: string;
  name: string;
  description: string;
  game: string;
  unlockedAt: number;
  proof?: string;  // Event ID that triggered unlock
}

// Achievement event
const achievementEvent = createEvent(30078, JSON.stringify({
  type: "achievement",
  achievement: { id: "first_checkmate", name: "First Checkmate" },
}), [
  ["d", `achievement_${pubkey}_first_checkmate`],
]);
```

#### Reputation/Rating System

```typescript
// Decentralized rating using attestations
interface RatingAttestation {
  rater: string;      // Opponent's pubkey
  ratee: string;      // Your pubkey
  game: string;
  gameId: string;
  result: "win" | "loss" | "draw";
  timestamp: number;
}

// Calculate rating from attestations
function calculateRating(attestations: RatingAttestation[]): number {
  // Implement Elo or Glicko-2
}
```

### Mobile Push Notifications

```typescript
// Register for push notifications
const pushSubscription = await navigator.serviceWorker.ready
  .then(reg => reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: VAPID_PUBLIC_KEY,
  }));

// Store subscription in Nostr (encrypted to self)
await publishPushSubscription(pubkey, pushSubscription);

// Server-side: Watch for game updates and send push
```

### Game Replay/History

```typescript
// Store complete game history (not just current state)
interface GameArchive {
  gameId: string;
  players: [string, string];
  moves: Move[];
  timestamps: number[];
  result: string;
  analysis?: GameAnalysis;
}

// Archive completed games
const archiveEvent = createEvent(30078, JSON.stringify(archive), [
  ["d", `archive_${gameId}`],
  ["t", "game-archive"],
]);
```

## Implementation Guidelines

### Adding New Features

1. **Define new event kinds** if needed (or use existing 30078 with different d-tag prefix)
2. **Maintain backward compatibility** with existing games
3. **Consider privacy** - encrypt sensitive data
4. **Document NIPs used** and any custom extensions
5. **Test with multiple relays** to ensure propagation

### AI Considerations

- **Privacy**: Game state is encrypted; AI needs decrypted access
- **Identity**: AI opponents should have Nostr keypairs
- **Fairness**: Clearly indicate AI players; consider separate leaderboards
- **Performance**: Target <5 second move generation

### Relay Considerations

- **Custom relays** may be needed for real-time features (tournaments, spectating)
- **Relay policies** vary - some may reject large events or custom kinds
- **Redundancy** - don't rely on a single relay for critical features

## Future NIPs to Watch

- **NIP-32**: Labeling (for AI-generated content)
- **NIP-51**: Lists (for game collections, favorites)
- **NIP-72**: Moderated communities (for tournament organization)
- **NIP-XX**: Potential gaming-specific NIPs
