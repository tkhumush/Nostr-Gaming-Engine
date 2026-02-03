# Architecture Overview

## Purpose

This document provides a high-level overview of the Nostr Gaming Engine - a reusable platform for building peer-to-peer turn-based games on Nostr with Lightning payment integration. The platform is designed to be game-agnostic, allowing any board game (chess, checkers, go, etc.) to be built on top of it.

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   React     │  │   Hooks     │  │   Components│  │   Modals    │        │
│  │   App.tsx   │  │   useNostr  │  │   Board     │  │   Login     │        │
│  │             │  │   useGame   │  │   Lobby     │  │   Wallet    │        │
│  │             │  │   useWallet │  │   GameView  │  │   Settings  │        │
│  └─────────────┴──┴─────────────┴──┴─────────────┴──┴─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────┐
│        GAME-AGNOSTIC PLATFORM        │  │        GAME-SPECIFIC LOGIC       │
│                                      │  │          (Reference Impl)        │
│  ┌────────────────────────────────┐  │  │  ┌────────────────────────────┐  │
│  │      Nostr Infrastructure      │  │  │  │      GameEngine.ts         │  │
│  │  ┌──────────┐  ┌────────────┐  │  │  │  │  • Move validation         │  │
│  │  │ client.ts│  │ profiles.ts│  │  │  │  │  • Score calculation       │  │
│  │  │ • Auth   │  │ • Kind 0   │  │  │  │  │  • Turn management         │  │
│  │  │ • NDK    │  │ • Search   │  │  │  │  │  • Win detection           │  │
│  │  │ • Relays │  │ • NIP-05   │  │  │  │  └────────────────────────────┘  │
│  │  └──────────┘  └────────────┘  │  │  │  ┌────────────────────────────┐  │
│  │  ┌──────────┐  ┌────────────┐  │  │  │  │      Board.ts              │  │
│  │  │encryption│  │ NostrSync  │  │  │  │  │  • Word validation         │  │
│  │  │ • NIP-44 │  │ • Kind 30078│ │  │  │  │  • Placement rules         │  │
│  │  │ • NIP-04 │  │ • Pub/Sub  │  │  │  │  │  • Multipliers             │  │
│  │  └──────────┘  └────────────┘  │  │  │  └────────────────────────────┘  │
│  └────────────────────────────────┘  │  │  ┌────────────────────────────┐  │
│                                      │  │  │      Dictionary.ts         │  │
│  ┌────────────────────────────────┐  │  │  │  • Trie-based lookup       │  │
│  │       Wallet Integration       │  │  │  │  • Word validation         │  │
│  │  ┌──────────┐  ┌────────────┐  │  │  │  └────────────────────────────┘  │
│  │  │ NWC      │  │ Spark      │  │  │  └──────────────────────────────────┘
│  │  │ (NIP-47) │  │ (Breez SDK)│  │  │
│  │  └──────────┘  └────────────┘  │  │
│  │  ┌──────────┐  ┌────────────┐  │  │
│  │  │ Bitcoin  │  │ Zap Request│  │  │
│  │  │ Connect  │  │ (NIP-57)   │  │  │
│  │  └──────────┘  └────────────┘  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              NOSTR NETWORK                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                           Relay Pool                                    │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │ │
│  │  │relay.damus.io│ │  nos.lol     │ │relay.primal  │ │ nostr.wine   │   │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Core Platform Components

### 1. Nostr Infrastructure Layer (`src/nostr/`)

| File | Purpose | Reusable |
|------|---------|----------|
| `client.ts` | NDK initialization, multi-auth (NIP-07, NIP-46, private key), relay management | Yes |
| `encryption.ts` | NIP-44 encryption/decryption for game state privacy | Yes |
| `NostrSync.ts` | Game state synchronization via Kind 30078 events | Yes |
| `profiles.ts` | User profile fetching, search, updates (Kind 0) | Yes |
| `imageUpload.ts` | NIP-98 authenticated image uploads to nostr.build | Yes |
| `games.ts` | Game listing and deletion helpers | Yes |

### 2. Wallet Integration Layer (`src/wallet/`)

| File | Purpose | Reusable |
|------|---------|----------|
| `walletManager.ts` | Unified wallet API, zap orchestration | Yes |
| `walletStore.ts` | Multi-wallet state management | Yes |
| `providers/nwc.ts` | NIP-47 Nostr Wallet Connect implementation | Yes |
| `spark/index.ts` | Breez SDK Spark self-custodial wallet | Yes |
| `bitcoinConnect.ts` | External wallet via Bitcoin Connect | Yes |
| `nwcBackup.ts` | NWC connection backup to Nostr | Yes |
| `spark/backup.ts` | Spark mnemonic backup to Nostr | Yes |

### 3. React Integration Layer (`src/hooks/`)

| File | Purpose | Reusable |
|------|---------|----------|
| `useNostr.ts` | React hook for Nostr authentication state | Yes |
| `useWallet.ts` | React hook for wallet operations | Yes |
| `useGame.ts` | React hook for game state management | Partially (game-specific) |

### 4. Type Definitions (`src/types/`)

| File | Purpose | Reusable |
|------|---------|----------|
| `nostr.ts` | Nostr event types, relay configuration | Yes |
| `wallet.ts` | Wallet types, zap parameters | Yes |
| `game.ts` | Game state interface | Template for new games |

## Separation of Concerns

### Platform Layer (Game-Agnostic)

These components know nothing about Scrabble, chess, or any specific game:

- **Identity**: NIP-07/NIP-46 authentication
- **Transport**: Relay connections, event publishing/subscribing
- **Privacy**: NIP-44 encryption between players
- **Storage**: Kind 30078 replaceable events
- **Payments**: Lightning invoices, zap requests
- **Profiles**: User metadata, lightning addresses

### Game Layer (Game-Specific)

The reference implementation (Scrabble) demonstrates how games plug into the platform:

- **State Shape**: `GameState` interface in `src/types/game.ts`
- **Validation**: `GameEngine.validateMove()`
- **Transitions**: `GameEngine.applyMove()`, `applyPass()`, etc.
- **Serialization**: JSON encoding of game state

## Interface Contract Summary

To build a new game on this platform, implement:

```typescript
// 1. Define your game state shape
interface YourGameState {
  meta: {
    gameId: string;
    playerOne: string;
    playerTwo: string;
    status: 'active' | 'completed' | 'abandoned' | 'deleted';
    winner?: string;
  };
  turn: {
    index: number;
    activePlayer: string;
    timestamp: number;
    lastMoveHash: string;
  };
  // ... your game-specific state
}

// 2. Implement state transitions
class YourGameEngine {
  static initializeGame(p1: string, p2: string): YourGameState;
  static validateMove(state: YourGameState, move: YourMove): ValidationResult;
  static applyMove(state: YourGameState, move: YourMove, ...): YourGameState;
  static isGameOver(state: YourGameState): boolean;
  static endGame(state: YourGameState): YourGameState;
}

// 3. Use NostrSync for transport (unchanged)
const sync = new NostrSync(gameId, opponentPubkey);
await sync.publishGameState(newState, previousEventId);
```

## Key Design Principles

### 1. Serverless Architecture
No central server. All game state is stored on Nostr relays as encrypted events. Both players can reconstruct the complete game state from relay data.

### 2. End-to-End Encryption
Game state is encrypted using NIP-44 (XChaCha20-Poly1305). Only the two players can decrypt and read the game state.

### 3. Turn Validation Chain
Each move references the previous event ID via `lastMoveHash`, creating a blockchain-like chain that prevents race conditions and ensures move ordering.

### 4. Wallet Flexibility
Players can use any Lightning wallet: NIP-07 extensions, NWC remote wallets, or the embedded Spark wallet. Zaps serve as move notifications.

### 5. Relay Redundancy
Game state is published to multiple relays. User's NIP-65 relay preferences are respected and merged with default relays.

## NIPs Used

| NIP | Purpose | Component |
|-----|---------|-----------|
| NIP-01 | Basic protocol flow | All |
| NIP-04 | Legacy encryption (fallback) | `encryption.ts` |
| NIP-07 | Browser extension signing | `client.ts` |
| NIP-44 | Modern encryption | `encryption.ts` |
| NIP-46 | Remote signer (Bunker) | `client.ts` |
| NIP-47 | Wallet Connect | `providers/nwc.ts` |
| NIP-57 | Zaps | `walletManager.ts` |
| NIP-65 | Relay list metadata | `client.ts` |
| NIP-78 | Application-specific data (Kind 30078) | `NostrSync.ts` |
| NIP-98 | HTTP Auth | `imageUpload.ts` |

## Directory Structure for New Games

```
your-nostr-game/
├── src/
│   ├── nostr/          # Copy from platform (unchanged)
│   ├── wallet/         # Copy from platform (unchanged)
│   ├── hooks/
│   │   ├── useNostr.ts # Copy from platform (unchanged)
│   │   ├── useWallet.ts# Copy from platform (unchanged)
│   │   └── useGame.ts  # Adapt for your game
│   ├── engine/         # Your game logic
│   │   └── YourGameEngine.ts
│   ├── types/
│   │   ├── nostr.ts    # Copy, update d-tag prefix
│   │   ├── wallet.ts   # Copy (unchanged)
│   │   └── game.ts     # Your game state types
│   └── components/     # Your UI
└── ...
```

## Current Limitations

1. **Two Players Only**: Platform assumes exactly two players per game
2. **Turn-Based Only**: Real-time games not supported
3. **No Spectator Mode**: Only participants can decrypt game state
4. **Tile Bag Visibility**: In Scrabble impl, bag is in state (technically peekable)
5. **No Game History Replay**: Events are replaceable, only latest state kept

## Dependencies

- `@nostr-dev-kit/ndk` - Nostr client library
- `nostr-tools` - Low-level Nostr utilities
- `@noble/hashes` - Cryptographic functions
- `@getalby/bitcoin-connect` - External wallet integration
- `@breeztech/breez-sdk-spark` - Self-custodial Lightning wallet
