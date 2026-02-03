# Nostr Game Starter Template

A minimal template for building turn-based games on the Nostr Gaming Engine.

## Quick Start

1. Copy this template:
   ```bash
   cp -r templates/game-starter my-game
   cd my-game
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development:
   ```bash
   npm run dev
   ```

## Files to Customize

| File | Purpose | What to Change |
|------|---------|----------------|
| `src/types/game.ts` | Game state types | Define your board, pieces, moves |
| `src/engine/GameEngine.ts` | Game logic | Implement rules, validation, win detection |
| `src/hooks/useGame.ts` | React state | Usually minimal changes needed |
| `src/App.tsx` | UI | Build your game interface |
| `src/index.css` | Styles | Customize appearance |

## Implementation Checklist

### 1. Define Your Game State (`src/types/game.ts`)

```typescript
export interface GameState {
  meta: GameMeta;      // Required
  turn: TurnInfo;      // Required

  // Your game state:
  board: string[][];   // Example: 2D grid
  scores: { p1: number; p2: number };
}

export interface GameMove {
  row: number;
  col: number;
}
```

### 2. Implement Game Logic (`src/engine/GameEngine.ts`)

- `initializeGame()` - Set up initial board
- `validateMove()` - Check if move is legal
- `applyMove()` - Update state with move
- `isGameOver()` - Detect end conditions
- `determineWinner()` - Who won?

### 3. Build Your UI (`src/App.tsx`)

- Game board component
- Move selection
- Turn indicator
- Game over modal

## Platform Features Available

```typescript
import {
  // Auth
  useNostr,

  // Wallet
  useWallet,

  // Game sync
  NostrSync,

  // Profiles
  fetchProfile,

  // Settings
  getDisableGameplayZaps,
} from "@nostr-gaming-engine/core";
```

## Testing

1. Open app in two browser windows
2. Log in with different Nostr accounts
3. Create a game from one window
4. The other should see it in their lobby

## Need Help?

See the full documentation in `/docs` or check the Scrabble example in `/examples/scrabble`.
