# Getting Started

## Purpose

A quickstart guide for developers who want to build a new turn-based game on the Nostr Gaming Engine platform.

## Prerequisites

- Node.js 18+
- npm or pnpm
- Basic understanding of:
  - React and TypeScript
  - Nostr protocol basics (pubkeys, relays, events)
  - Lightning Network (for optional zaps)

## Quick Start: Building a New Game

### Step 1: Clone and Install

```bash
# Clone the reference implementation
git clone https://github.com/your-org/nostr-gaming-engine.git
cd nostr-gaming-engine

# Install dependencies
npm install

# Start development server
npm run dev
```

### Step 2: Understand the Directory Structure

```
src/
├── nostr/              # KEEP - Nostr infrastructure (copy as-is)
│   ├── client.ts       # NDK, auth, relay management
│   ├── encryption.ts   # NIP-44 encryption
│   ├── NostrSync.ts    # Game state sync
│   ├── profiles.ts     # User profiles
│   └── games.ts        # Game listing
├── wallet/             # KEEP - Lightning integration (copy as-is)
│   ├── walletManager.ts
│   ├── providers/nwc.ts
│   ├── spark/
│   └── bitcoinConnect.ts
├── hooks/              # ADAPT - React hooks
│   ├── useNostr.ts     # KEEP as-is
│   ├── useWallet.ts    # KEEP as-is
│   └── useGame.ts      # ADAPT for your game
├── engine/             # REPLACE - Your game logic
│   ├── GameEngine.ts   # Replace with your game engine
│   ├── Board.ts        # Replace with your game board
│   └── Dictionary.ts   # Game-specific (remove for chess)
├── types/              # ADAPT
│   ├── nostr.ts        # Update d-tag prefixes
│   ├── wallet.ts       # KEEP as-is
│   └── game.ts         # Replace with your game types
├── components/         # REPLACE - Your UI
└── settings/           # KEEP - App settings
```

### Step 3: Define Your Game State

Create your game state interface in `src/types/game.ts`:

```typescript
// Required base structure (must include these fields)
interface ChessState {
  meta: {
    gameId: string;
    playerOne: string;      // White player pubkey
    playerTwo: string;      // Black player pubkey
    status: 'active' | 'completed' | 'abandoned' | 'deleted';
    winner?: string;
  };
  turn: {
    index: number;          // Move number
    activePlayer: string;   // Whose turn
    timestamp: number;
    lastMoveHash: string;   // Previous event ID
  };

  // Your game-specific state
  board: string;            // FEN notation
  moveHistory: string[];    // Algebraic notation
  capturedPieces: { white: string[]; black: string[] };
}
```

### Step 4: Implement Your Game Engine

Create `src/engine/ChessEngine.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';

export class ChessEngine {
  // Initialize a new game
  static initializeGame(playerOne: string, playerTwo: string): ChessState {
    return {
      meta: {
        gameId: uuidv4(),
        playerOne,
        playerTwo,
        status: 'active',
      },
      turn: {
        index: 0,
        activePlayer: playerOne,  // White moves first
        timestamp: Date.now(),
        lastMoveHash: '',
      },
      board: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moveHistory: [],
      capturedPieces: { white: [], black: [] },
    };
  }

  // Validate a move
  static validateMove(state: ChessState, move: string): { valid: boolean; error?: string } {
    // Use a chess library like chess.js for validation
    // Return { valid: true } or { valid: false, error: 'Illegal move' }
  }

  // Apply a move and return new state
  static applyMove(
    state: ChessState,
    move: string,
    playerPubkey: string,
    previousEventId: string,
  ): { state: ChessState } {
    // Apply the move to the board
    // Return new state with updated turn info
  }

  static isGameOver(state: ChessState): boolean {
    // Check for checkmate, stalemate, draw
  }

  static getOpponent(state: ChessState, playerPubkey: string): string {
    return state.meta.playerOne === playerPubkey
      ? state.meta.playerTwo
      : state.meta.playerOne;
  }
}
```

### Step 5: Update D-Tag Prefix

In `src/types/nostr.ts`, update the game identifier:

```typescript
export const GAME_KIND = 30078;
export const GAME_D_TAG_PREFIX = "chess_v1_";  // Your game's prefix
export const PRIVATE_D_TAG_PREFIX = "chess_private_";  // If needed
```

### Step 6: Create Your Game Hook

Adapt `src/hooks/useGame.ts`:

```typescript
import { ChessEngine } from '../engine/ChessEngine';
import { NostrSync } from '../nostr/NostrSync';

export function useChess() {
  const [gameState, setGameState] = useState<ChessState | null>(null);
  const syncRef = useRef<NostrSync | null>(null);

  const createGame = async (opponentPubkey: string) => {
    const state = ChessEngine.initializeGame(myPubkey, opponentPubkey);
    syncRef.current = new NostrSync(state.meta.gameId, opponentPubkey);

    const eventId = await syncRef.current.publishGameState(state, '');
    setGameState(state);

    return state.meta.gameId;
  };

  const makeMove = async (move: string) => {
    const validation = ChessEngine.validateMove(gameState!, move);
    if (!validation.valid) {
      return { error: validation.error };
    }

    const { state: newState } = ChessEngine.applyMove(
      gameState!,
      move,
      myPubkey,
      lastEventId,
    );

    await syncRef.current!.publishGameState(newState, lastEventId);
    setGameState(newState);

    return { success: true };
  };

  return { gameState, createGame, makeMove, loadGame, resign };
}
```

### Step 7: Build Your UI

Create game-specific React components in `src/components/`.

### Step 8: Test

```bash
# Run tests
npm test

# Test with two browser windows
npm run dev
# Open localhost:5173 in two browsers with different Nostr accounts
```

## Environment Variables

```bash
# .env
VITE_BREEZ_SPARK_API_KEY=your_breez_api_key  # For self-custodial wallet
```

## Key Files to Copy Unchanged

These platform files work for any game:

```
src/nostr/client.ts
src/nostr/encryption.ts
src/nostr/NostrSync.ts
src/nostr/profiles.ts
src/wallet/*
src/hooks/useNostr.ts
src/hooks/useWallet.ts
src/settings/appSettings.ts
```

## Key Files to Modify

| File | What to Change |
|------|----------------|
| `src/types/nostr.ts` | Update `GAME_D_TAG_PREFIX` |
| `src/types/game.ts` | Your game state interface |
| `src/engine/*` | Your game logic |
| `src/hooks/useGame.ts` | Adapt for your game engine |
| `src/components/*` | Your game UI |

## Checklist

- [ ] Define game state extending base structure
- [ ] Implement game engine with required methods
- [ ] Update d-tag prefix
- [ ] Create game-specific hook
- [ ] Build UI components
- [ ] Test two-player sync
- [ ] Add zap messages for your game
- [ ] Update localStorage keys to avoid conflicts

## Common Pitfalls

1. **Forgetting `lastMoveHash`**: Every move must reference the previous event ID
2. **Not encrypting state**: Always use `encryptContent()` before publishing
3. **localStorage conflicts**: Use unique prefixes for your game
4. **Large state**: Keep under 64KB for reliable relay storage

## Next Steps

1. Read [Architecture Overview](./01-architecture-overview.md) for the full picture
2. Study [Game Interface Contract](./11-game-interface-contract.md) for detailed requirements
3. Review [Real-Time Sync](./07-real-time-sync.md) for subscription patterns
