# Nostr Gaming Engine

Build peer-to-peer turn-based games on Nostr with Lightning payments.

## What You Can Build

Use this engine to create any two-player turn-based game:

- **Chess** - Classic strategy with move validation
- **Go** - Territory control with capture detection
- **Checkers** - Jump chains and king promotions
- **Backgammon** - Dice rolls and bearing off
- **Tic-Tac-Toe** - Simple starter project
- **Card Games** - Poker, Blackjack with hidden hands
- **And more** - Any game with alternating turns

## Why Nostr?

Traditional online games require servers, accounts, and trust. Nostr Gaming Engine is different:

| Traditional | Nostr Gaming Engine |
|-------------|---------------------|
| Central server required | Serverless - games live on relays |
| Create account, verify email | Just your Nostr keys |
| Server sees all game data | End-to-end encrypted between players |
| Push notifications | Lightning zaps as notifications |
| Payment processing fees | Direct peer-to-peer Lightning |
| Server can shut down | Games persist on any relay |

## How It Works

```
┌─────────────┐                    ┌─────────────┐
│  Player A   │                    │  Player B   │
│  (React)    │                    │  (React)    │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  1. Create game                  │
       │  2. Encrypt state                │
       │  3. Publish to relays            │
       ▼                                  │
┌──────────────────────────────────────────────────┐
│                  Nostr Relays                    │
│           Kind 30078 Game Events                 │
│         (encrypted, replaceable)                 │
└──────────────────────────────────────────────────┘
       │                                  │
       │         4. Subscribe             │
       │         5. Decrypt               │
       │         6. Render game           │
       │                                  ▼
       │                           ┌──────────────┐
       │  7. Zap notification ──── │ Lightning    │
       │     "Your turn!"          │ Network      │
       └──────────────────────────►└──────────────┘
```

## Quick Start

### 1. Start with the Template

```bash
# Clone the repo
git clone https://github.com/tkhumush/Nostr-Gaming-Engine.git
cd Nostr-Gaming-Engine

# Copy the starter template
cp -r templates/game-starter my-chess-game
cd my-chess-game

# Install and run
pnpm install
pnpm dev
```

### 2. Define Your Game State

```typescript
// src/types/game.ts
export interface ChessState {
  board: Piece[][];           // 8x8 grid
  turn: 'white' | 'black';
  castlingRights: CastlingRights;
  enPassantSquare: Square | null;
  halfMoveClock: number;
  fullMoveNumber: number;
}

export interface ChessMove {
  from: Square;
  to: Square;
  promotion?: PieceType;
}
```

### 3. Implement Your Game Engine

```typescript
// src/engine/GameEngine.ts
export function validateMove(state: ChessState, move: ChessMove): boolean {
  // Your chess logic here
}

export function applyMove(state: ChessState, move: ChessMove): ChessState {
  // Return new state after move
}

export function isGameOver(state: ChessState): boolean {
  return isCheckmate(state) || isStalemate(state) || isDraw(state);
}
```

### 4. Connect to Nostr

```typescript
// The engine handles all the Nostr complexity
import { useNostr, useWallet, NostrSync } from '@nostr-gaming-engine/core';

function ChessGame({ gameId, opponentPubkey }) {
  const { user } = useNostr();
  const sync = new NostrSync(gameId, opponentPubkey);

  // Publish moves - automatically encrypted
  await sync.publishGameState(newState, previousEventId);

  // Subscribe to opponent moves - automatically decrypted
  sync.subscribe((event) => {
    setGameState(event.decryptedContent);
  });
}
```

## Core Features

### Authentication
Multiple ways to connect:
- **NIP-07** - Browser extensions (Alby, nos2x)
- **NIP-46** - Remote signer (Nostr Connect)
- **Direct key** - For development/testing

### Game Sync
The `NostrSync` class handles:
- Publishing encrypted game state to relays
- Subscribing to opponent's moves
- Turn validation via hash chains
- Automatic reconnection

### Wallet Integration
Three wallet options built-in:
- **NWC** - Nostr Wallet Connect (Alby, etc.)
- **Spark** - Breez SDK self-custodial wallet
- **Bitcoin Connect** - External wallet connection

### Notifications
Alert players when it's their turn:
- Lightning zaps (with custom amounts)
- Encrypted DMs (Kind 4)
- Browser notifications

## Repository Structure

```
nostr-gaming-engine/
├── packages/core/           # The engine - use this in your game
│   └── src/
│       ├── nostr/          # Client, sync, encryption, profiles
│       ├── wallet/         # NWC, Spark, Bitcoin Connect
│       ├── hooks/          # useNostr, useWallet
│       └── types/          # Shared TypeScript types
│
├── examples/scrabble/      # Full game implementation
│   └── src/
│       ├── engine/         # Scrabble-specific game logic
│       ├── components/     # React UI components
│       └── hooks/          # useGame hook
│
├── templates/game-starter/ # Start here for new games
│   └── src/
│       ├── types/          # Game state skeleton
│       ├── engine/         # GameEngine skeleton
│       └── hooks/          # useGame template
│
└── docs/                   # Comprehensive documentation
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/00-getting-started.md) | Build a Chess game step-by-step |
| [Architecture](docs/01-architecture-overview.md) | System design and data flow |
| [Authentication](docs/02-authentication-and-identity.md) | NIP-07, NIP-46, key management |
| [Game Storage](docs/06-game-session-storage.md) | How game state is stored on Nostr |
| [Real-time Sync](docs/07-real-time-sync.md) | NostrSync class deep dive |
| [Wallet & Zaps](docs/09-wallet-and-zaps.md) | Lightning integration |
| [Game Contract](docs/13-game-interface-contract.md) | What your game must implement |

[View all documentation →](docs/)

## Example: Words With Zaps

The `examples/scrabble/` directory contains a complete Scrabble implementation:

- 15x15 board with premium squares
- Full scoring with bingo bonus
- Tile exchange and passing
- Dictionary validation
- Game sharing via URL
- Zap notifications on moves

Run it:
```bash
pnpm install
pnpm dev
```

## Requirements

- Node.js 18+
- pnpm
- Nostr identity (browser extension or private key)
- Lightning wallet (optional, for zap notifications)

## Tech Stack

- **UI**: React 18 + TypeScript + Vite
- **Nostr**: @nostr-dev-kit/ndk + nostr-tools
- **Wallets**: NWC, Breez SDK Spark, Bitcoin Connect
- **Build**: pnpm workspaces

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT
