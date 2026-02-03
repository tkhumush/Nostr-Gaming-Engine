# Nostr Gaming Engine

A platform for building peer-to-peer turn-based games on Nostr with Lightning payments.

## Overview

Nostr Gaming Engine provides the infrastructure to build serverless, censorship-resistant games where:
- **Game state** is stored on Nostr relays (Kind 30078 replaceable events)
- **Identity** uses Nostr public keys (NIP-07, NIP-46, or direct key)
- **Privacy** is ensured via NIP-44 encryption between players
- **Notifications** are sent as Lightning Zaps (NIP-57) or encrypted DMs (NIP-04)
- **Payments** use NWC (NIP-47), Breez SDK Spark, or Bitcoin Connect

No central server. No accounts. Just players and the Nostr network.

## Repository Structure

```
nostr-gaming-engine/
├── packages/
│   └── core/              # @nostr-gaming-engine/core - Reusable platform
├── examples/
│   └── scrabble/          # Words With Zaps - Full Scrabble implementation
├── templates/
│   └── game-starter/      # Minimal template for new games
└── docs/                  # Comprehensive documentation
```

## Quick Start

### Using the Scrabble Example

```bash
# Install pnpm if needed
npm install -g pnpm

# Install dependencies
pnpm install

# Start the Scrabble game
pnpm dev
```

### Building Your Own Game

```bash
# Copy the starter template
cp -r templates/game-starter my-game
cd my-game

# Install dependencies
pnpm install

# Start development
pnpm dev
```

See [docs/00-getting-started.md](docs/00-getting-started.md) for a complete walkthrough.

## Core Package

The `@nostr-gaming-engine/core` package provides:

- **Nostr Infrastructure**: NDK wrapper, authentication, relay management
- **Game Sync**: NostrSync class for publishing/subscribing to game state
- **Encryption**: NIP-44 encryption for private game data
- **Wallet Integration**: NWC, Breez SDK Spark, Bitcoin Connect
- **React Hooks**: useNostr, useWallet for easy integration
- **Profile Management**: Fetch and update Nostr profiles

```typescript
import {
  useNostr,
  useWallet,
  NostrSync,
  fetchProfile,
} from '@nostr-gaming-engine/core';
```

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/00-getting-started.md) | Build your first game step-by-step |
| [Architecture](docs/01-architecture-overview.md) | System design and data flow |
| [Authentication](docs/02-authentication-and-identity.md) | NIP-07, NIP-46, key management |
| [Relay Management](docs/03-relay-management.md) | Relay discovery and connection |
| [Event System](docs/04-event-system.md) | Publishing and subscribing to events |
| [Encryption](docs/05-encryption.md) | NIP-44 encryption details |
| [Game Storage](docs/06-game-session-storage.md) | Kind 30078 game state format |
| [Real-time Sync](docs/07-real-time-sync.md) | NostrSync class usage |
| [User Profiles](docs/08-user-profiles.md) | Profile fetching and display |
| [Wallet & Zaps](docs/09-wallet-and-zaps.md) | Lightning wallet integration |
| [Notifications](docs/10-notifications.md) | Turn notifications via DMs/zaps |
| [Matchmaking](docs/11-matchmaking-and-lobby.md) | Game discovery and lobby |
| [Settings](docs/12-app-settings.md) | User preferences storage |
| [Game Contract](docs/13-game-interface-contract.md) | Required game implementation |
| [Extensibility](docs/14-extensibility.md) | Adding new features |

## Features

- **Multi-wallet Support**: NWC, Breez SDK Spark, Bitcoin Connect
- **Cloud Backup**: Wallet credentials encrypted on Nostr
- **Profile Management**: Fetch, cache, and update user profiles
- **Real-time Sync**: Subscriptions with automatic reconnection
- **Relay Management**: User relay lists (NIP-65), multi-relay publishing

## Examples

### Words With Zaps (Scrabble)

A full-featured Scrabble implementation demonstrating:
- 15x15 board with premium squares
- Complete scoring logic with bingo bonus
- Tile exchange and passing
- Game sharing via URL
- Zap notifications on moves

## Requirements

- Node.js 18+
- pnpm (recommended) or npm
- A Nostr identity (NIP-07 extension or private key)
- Optional: Lightning wallet for zap notifications

## Tech Stack

- **Platform**: React 18 + TypeScript
- **Nostr**: @nostr-dev-kit/ndk + nostr-tools
- **Build**: Vite + pnpm workspaces
- **Wallet**: NWC, Breez SDK, Bitcoin Connect

## License

MIT
