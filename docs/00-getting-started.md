# Getting Started

## Purpose

A quickstart guide for developers who want to build a new turn-based game on the Nostr Gaming Engine platform.

## Prerequisites

- Node.js 18+
- npm or pnpm
- Basic understanding of:
  - React and TypeScript
  - Nostr protocol basics (pubkeys, relays, events)
  - Lightning Network (optional, for zaps)

## Architecture at a Glance

```
┌────────────────────────────────────────────────────────────────────┐
│                         YOUR GAME                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐   │
│  │  Game Engine   │  │   Game Hook    │  │    Game UI         │   │
│  │  (your logic)  │  │  (useYourGame) │  │  (React components)│   │
│  └───────┬────────┘  └───────┬────────┘  └────────────────────┘   │
└──────────┼───────────────────┼─────────────────────────────────────┘
           │                   │
           ▼                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                    NOSTR GAMING ENGINE (Platform)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ NostrSync    │  │ Encryption   │  │ Wallet       │             │
│  │ (state sync) │  │ (NIP-44)     │  │ (NWC/Spark)  │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │ Auth         │  │ Profiles     │  │ Notifications│             │
│  │ (NIP-07/46)  │  │ (Kind 0)     │  │ (Kind 1/4)   │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                       NOSTR NETWORK                                │
│              Relays store encrypted game state                     │
└────────────────────────────────────────────────────────────────────┘
```

## Quick Start: Build Chess in 6 Steps

### Step 1: Clone and Explore

```bash
git clone https://github.com/your-org/nostr-gaming-engine.git
cd nostr-gaming-engine
npm install
npm run dev
```

Open `http://localhost:5173` and play a game to understand the flow.

### Step 2: Define Your Game State

Create `src/types/chess.ts`:

```typescript
// Base structure required by the platform
export interface ChessState {
  // REQUIRED: Game metadata
  meta: {
    gameId: string;
    playerOne: string;      // White player (hex pubkey)
    playerTwo: string;      // Black player (hex pubkey)
    status: 'active' | 'completed' | 'abandoned' | 'deleted';
    winner?: string;
  };

  // REQUIRED: Turn tracking
  turn: {
    index: number;          // Move counter
    activePlayer: string;   // Whose turn (hex pubkey)
    timestamp: number;      // Unix ms
    lastMoveHash: string;   // Previous event ID (chain validation)
  };

  // YOUR GAME STATE
  fen: string;              // Board position in FEN notation
  pgn: string[];            // Move history in algebraic notation
  drawOffer?: string;       // Pubkey of player offering draw
}

export interface ChessMove {
  from: string;   // e.g., "e2"
  to: string;     // e.g., "e4"
  promotion?: 'q' | 'r' | 'b' | 'n';
}
```

### Step 3: Implement Your Game Engine

Create `src/engine/ChessEngine.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import { Chess } from 'chess.js';  // npm install chess.js
import type { ChessState, ChessMove } from '../types/chess';

export class ChessEngine {
  // Initialize a new game
  static initializeGame(playerOne: string, playerTwo: string): ChessState {
    return {
      meta: {
        gameId: uuidv4(),
        playerOne,        // White
        playerTwo,        // Black
        status: 'active',
      },
      turn: {
        index: 0,
        activePlayer: playerOne,  // White moves first
        timestamp: Date.now(),
        lastMoveHash: '',
      },
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      pgn: [],
    };
  }

  // Validate a move
  static validateMove(
    state: ChessState,
    move: ChessMove,
  ): { valid: boolean; error?: string; san?: string } {
    const chess = new Chess(state.fen);

    try {
      const result = chess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      });

      if (!result) {
        return { valid: false, error: 'Illegal move' };
      }

      return { valid: true, san: result.san };
    } catch (e) {
      return { valid: false, error: 'Invalid move format' };
    }
  }

  // Apply a validated move
  static applyMove(
    state: ChessState,
    move: ChessMove,
    playerPubkey: string,
    previousEventId: string,
  ): { state: ChessState; san: string } {
    const chess = new Chess(state.fen);
    const result = chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });

    const newState: ChessState = {
      ...state,
      turn: {
        index: state.turn.index + 1,
        activePlayer: this.getOpponent(state, playerPubkey),
        timestamp: Date.now(),
        lastMoveHash: previousEventId,
      },
      fen: chess.fen(),
      pgn: [...state.pgn, result.san],
    };

    // Check for game end
    if (chess.isGameOver()) {
      newState.meta = {
        ...newState.meta,
        status: 'completed',
        winner: chess.isCheckmate()
          ? playerPubkey  // Current player wins
          : undefined,    // Draw
      };
    }

    return { state: newState, san: result.san };
  }

  static isGameOver(state: ChessState): boolean {
    const chess = new Chess(state.fen);
    return chess.isGameOver();
  }

  static getOpponent(state: ChessState, pubkey: string): string {
    return state.meta.playerOne === pubkey
      ? state.meta.playerTwo
      : state.meta.playerOne;
  }

  static isPlayerTurn(state: ChessState, pubkey: string): boolean {
    return state.turn.activePlayer === pubkey;
  }
}
```

### Step 4: Update Platform Configuration

Edit `src/types/nostr.ts`:

```typescript
// Change the d-tag prefix for your game
export const GAME_KIND = 30078;
export const GAME_D_TAG_PREFIX = "chess_v1_";  // Your game's unique prefix
```

### Step 5: Create Your Game Hook

Create `src/hooks/useChess.ts`:

```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import { ChessEngine } from '../engine/ChessEngine';
import { NostrSync } from '../nostr/NostrSync';
import { getCurrentUser } from '../nostr/client';
import type { ChessState, ChessMove } from '../types/chess';

export function useChess() {
  const [gameState, setGameState] = useState<ChessState | null>(null);
  const [lastEventId, setLastEventId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const syncRef = useRef<NostrSync | null>(null);

  const user = getCurrentUser();
  const myPubkey = user?.pubkey || '';

  // Create a new game
  const createGame = useCallback(async (opponentPubkey: string) => {
    if (!myPubkey) throw new Error('Not logged in');

    const state = ChessEngine.initializeGame(myPubkey, opponentPubkey);
    syncRef.current = new NostrSync(state.meta.gameId, opponentPubkey);

    const eventId = await syncRef.current.publishGameState(state, '');

    setGameState(state);
    setLastEventId(eventId);
    setError(null);

    return state.meta.gameId;
  }, [myPubkey]);

  // Load existing game
  const loadGame = useCallback(async (gameId: string, opponentPubkey: string) => {
    setLoading(true);
    try {
      syncRef.current = new NostrSync(gameId, opponentPubkey);
      const result = await syncRef.current.fetchLatestGameState();

      if (result) {
        setGameState(result.state as ChessState);
        setLastEventId(result.event.id || '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load game');
    } finally {
      setLoading(false);
    }
  }, []);

  // Make a move
  const makeMove = useCallback(async (move: ChessMove) => {
    if (!gameState || !syncRef.current) {
      return { error: 'No game loaded' };
    }

    if (!ChessEngine.isPlayerTurn(gameState, myPubkey)) {
      return { error: 'Not your turn' };
    }

    const validation = ChessEngine.validateMove(gameState, move);
    if (!validation.valid) {
      return { error: validation.error };
    }

    const { state: newState, san } = ChessEngine.applyMove(
      gameState,
      move,
      myPubkey,
      lastEventId,
    );

    try {
      const eventId = await syncRef.current.publishGameState(newState, lastEventId);
      setGameState(newState);
      setLastEventId(eventId);
      return { success: true, san };
    } catch (e) {
      return { error: 'Failed to publish move' };
    }
  }, [gameState, lastEventId, myPubkey]);

  // Subscribe to opponent moves
  useEffect(() => {
    if (!syncRef.current || !gameState) return;

    syncRef.current.subscribeToGameUpdates(
      (update) => {
        setGameState(update.state as ChessState);
        setLastEventId(update.event.id || '');
      },
      (err) => setError(err.message),
      { heartbeatMs: 30000 },
    );

    return () => syncRef.current?.stopSubscription();
  }, [gameState?.meta.gameId]);

  return {
    gameState,
    loading,
    error,
    isMyTurn: gameState ? ChessEngine.isPlayerTurn(gameState, myPubkey) : false,
    createGame,
    loadGame,
    makeMove,
  };
}
```

### Step 6: Build Your UI

Create `src/components/ChessBoard.tsx` using your preferred chess UI library.

```tsx
import { useChess } from '../hooks/useChess';
import { Chessboard } from 'react-chessboard';  // npm install react-chessboard

export function ChessGame({ gameId, opponent }: { gameId: string; opponent: string }) {
  const { gameState, isMyTurn, makeMove, loadGame } = useChess();

  useEffect(() => {
    loadGame(gameId, opponent);
  }, [gameId, opponent]);

  if (!gameState) return <div>Loading...</div>;

  return (
    <div>
      <div>{isMyTurn ? "Your turn" : "Opponent's turn"}</div>
      <Chessboard
        position={gameState.fen}
        onPieceDrop={(from, to) => {
          if (!isMyTurn) return false;
          makeMove({ from, to });
          return true;
        }}
      />
    </div>
  );
}
```

## File Structure

```
src/
├── nostr/              # KEEP AS-IS (platform layer)
│   ├── client.ts       # Auth, relays
│   ├── encryption.ts   # NIP-44
│   ├── NostrSync.ts    # State sync
│   ├── profiles.ts     # User profiles
│   └── games.ts        # Game listing
├── wallet/             # KEEP AS-IS (platform layer)
├── hooks/
│   ├── useNostr.ts     # KEEP AS-IS
│   ├── useWallet.ts    # KEEP AS-IS
│   └── useChess.ts     # YOUR GAME HOOK
├── engine/
│   └── ChessEngine.ts  # YOUR GAME LOGIC
├── types/
│   ├── nostr.ts        # UPDATE d-tag prefix
│   └── chess.ts        # YOUR GAME TYPES
└── components/         # YOUR UI
```

## Running Your Game

```bash
# Development
npm run dev

# Test with two players
# Open http://localhost:5173 in two browsers
# Log in with different Nostr accounts
# Create a game and play!

# Build for production
npm run build
```

## Common Tasks

### Adding Zap Notifications

```typescript
// In your game hook, after a successful move:
import { useWallet } from '../hooks/useWallet';

const { zapUser } = useWallet();

// After publishing move
await zapUser({
  recipientPubkey: opponentPubkey,
  amountSats: 21,
  gameId: gameState.meta.gameId,
  moveDescription: `Played ${san}`,  // e.g., "Played e4"
});
```

### Adding Browser Notifications

```typescript
// Request permission on mount
useEffect(() => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}, []);

// Notify when it becomes your turn
useEffect(() => {
  if (isMyTurn && !wasMyTurn) {
    new Notification('Chess', { body: "It's your turn!" });
  }
}, [isMyTurn]);
```

### Handling Resignation

```typescript
// In ChessEngine
static resign(state: ChessState, resigningPubkey: string): ChessState {
  return {
    ...state,
    meta: {
      ...state.meta,
      status: 'abandoned',
      winner: this.getOpponent(state, resigningPubkey),
    },
  };
}
```

## Environment Variables

```bash
# .env (optional)
VITE_BREEZ_SPARK_API_KEY=your_key  # For self-custodial wallet
```

## Checklist

- [ ] Define game state with required `meta` and `turn` fields
- [ ] Implement game engine with `initializeGame`, `validateMove`, `applyMove`
- [ ] Update `GAME_D_TAG_PREFIX` in `src/types/nostr.ts`
- [ ] Create game hook using `NostrSync`
- [ ] Build UI components
- [ ] Test two-player sync
- [ ] Add zap/notification support
- [ ] Update localStorage key prefixes to avoid conflicts

## Next Steps

1. **Deep dive**: Read [Architecture Overview](./01-architecture-overview.md)
2. **State contract**: Study [Game Interface Contract](./13-game-interface-contract.md)
3. **Sync details**: Review [Real-Time Sync](./07-real-time-sync.md)
4. **Notifications**: See [Notifications](./10-notifications.md)
