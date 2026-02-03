# Game Interface Contract

## Purpose

Define the abstract interface that any new game must implement to plug into this platform. This is the boundary between the game-agnostic platform (Nostr, wallets, sync) and game-specific logic.

## Core Contract

### 1. Game State Shape

Every game must define a state object that conforms to this base structure:

```typescript
// Required base structure
interface GameStateBase {
  meta: {
    gameId: string;           // Unique identifier (UUID recommended)
    playerOne: string;        // Hex pubkey of first player
    playerTwo: string;        // Hex pubkey of second player
    status: GameStatus;       // 'active' | 'completed' | 'abandoned' | 'deleted'
    winner?: string;          // Hex pubkey of winner (if completed)
    deletedBy?: string;       // Hex pubkey of deleter (if deleted)
  };
  turn: {
    index: number;            // Turn counter (starts at 0)
    activePlayer: string;     // Hex pubkey of who moves next
    timestamp: number;        // Unix timestamp of last move
    lastMoveHash: string;     // Event ID of previous state (for chain validation)
  };
  // ... game-specific fields below
}

type GameStatus = 'active' | 'completed' | 'abandoned' | 'deleted';
```

### 2. Game Engine Interface

Implement a stateless engine class with pure functions:

```typescript
interface IGameEngine<TState extends GameStateBase, TMove, TValidation> {
  // Initialize new game
  static initializeGame(playerOne: string, playerTwo: string): TState;

  // Validate a proposed move
  static validateMove(
    state: TState,
    move: TMove,
    playerPrivateState?: unknown,  // e.g., hand in card games
  ): TValidation;

  // Apply a move and return new state
  static applyMove(
    state: TState,
    move: TMove,
    playerPubkey: string,
    previousEventId: string,
  ): {
    state: TState;
    // ... any other results (score, drawn cards, etc.)
  };

  // Handle pass/skip turn
  static applyPass(
    state: TState,
    playerPubkey: string,
    previousEventId: string,
  ): TState;

  // Check if game is over
  static isGameOver(state: TState, ...args: unknown[]): boolean;

  // Finalize game (calculate winner, final scores)
  static endGame(state: TState, ...args: unknown[]): TState;

  // Player resignation
  static abandonGame(state: TState, resigningPlayer: string): TState;

  // Validate turn order
  static isPlayerTurn(state: TState, playerPubkey: string): boolean;

  // Get opponent
  static getOpponent(state: TState, playerPubkey: string): string;
}
```

### 3. Validation Result

```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;       // Human-readable error message
  // Game-specific fields
  score?: number;       // For scored games
  words?: string[];     // For word games
  captures?: string[];  // For capture games (chess, checkers)
}
```

## Reference Implementation: Scrabble

Here's how the current Scrabble implementation fulfills the contract:

### Game State

```typescript
// src/types/game.ts
interface GameState {
  meta: GameMeta;
  turn: TurnInfo;
  board: Record<string, string | BoardTile>;  // "x,y" => letter
  scoring: Scoring;
  tileBag: string[];  // Remaining tiles
}

interface Scoring {
  p1Score: number;
  p2Score: number;
  history: MoveHistory[];
}
```

### Game Engine

```typescript
// src/engine/GameEngine.ts
class GameEngine {
  static initializeGame(playerOne: string, playerTwo: string): GameState {
    return {
      meta: { gameId: uuidv4(), playerOne, playerTwo, status: 'active' },
      turn: { index: 0, activePlayer: playerOne, timestamp: Date.now(), lastMoveHash: '' },
      board: {},
      scoring: { p1Score: 0, p2Score: 0, history: [] },
      tileBag: shuffleArray(createTileBag()),
    };
  }

  static validateMove(
    state: GameState,
    placements: TilePlacement[],
    playerRack: string[],
  ): ValidationResult {
    if (state.meta.status !== 'active') {
      return { valid: false, error: 'Game is not active' };
    }
    // Check player has tiles, validate placement, validate words...
    return validateMove(state.board, placements);
  }

  static applyMove(
    state: GameState,
    placements: TilePlacement[],
    playerPubkey: string,
    previousEventId: string,
  ): { state: GameState; move: Move; tilesDrawn: string[] } {
    // Calculate score, update board, draw tiles, switch turns
    const newState = { ...state };
    newState.turn = {
      index: state.turn.index + 1,
      activePlayer: this.getOpponent(state, playerPubkey),
      timestamp: Date.now(),
      lastMoveHash: previousEventId,
    };
    // ... apply changes
    return { state: newState, move, tilesDrawn };
  }

  static isGameOver(state: GameState, p1Rack: string[], p2Rack: string[]): boolean {
    // Check for two consecutive passes
    const recent = state.scoring.history.slice(-2);
    return recent.length === 2 && recent.every(h => h.word === '(PASS)');
  }
}
```

## Adapting for Chess

### Game State

```typescript
interface ChessState {
  meta: {
    gameId: string;
    playerOne: string;      // White
    playerTwo: string;      // Black
    status: GameStatus;
    winner?: string;
  };
  turn: {
    index: number;          // Full move number
    activePlayer: string;   // Current player
    timestamp: number;
    lastMoveHash: string;
  };
  // Chess-specific
  board: ChessBoard;        // 8x8 array or FEN string
  castlingRights: {
    whiteKingside: boolean;
    whiteQueenside: boolean;
    blackKingside: boolean;
    blackQueenside: boolean;
  };
  enPassantTarget: string | null;  // e.g., "e3"
  halfMoveClock: number;    // For 50-move rule
  moveHistory: ChessMove[];
}

interface ChessMove {
  from: string;   // "e2"
  to: string;     // "e4"
  piece: string;  // "P" (pawn)
  captured?: string;
  promotion?: string;
  castling?: 'kingside' | 'queenside';
  check?: boolean;
  checkmate?: boolean;
}
```

### Game Engine

```typescript
class ChessEngine {
  static initializeGame(playerOne: string, playerTwo: string): ChessState {
    return {
      meta: { gameId: uuidv4(), playerOne, playerTwo, status: 'active' },
      turn: { index: 0, activePlayer: playerOne, timestamp: Date.now(), lastMoveHash: '' },
      board: createInitialBoard(),
      castlingRights: { whiteKingside: true, whiteQueenside: true, blackKingside: true, blackQueenside: true },
      enPassantTarget: null,
      halfMoveClock: 0,
      moveHistory: [],
    };
  }

  static validateMove(state: ChessState, move: ChessMove): ValidationResult {
    // Check piece exists, legal move, not in check after, etc.
    if (!isLegalMove(state, move)) {
      return { valid: false, error: 'Illegal move' };
    }
    return { valid: true, captures: move.captured ? [move.captured] : [] };
  }

  static applyMove(
    state: ChessState,
    move: ChessMove,
    playerPubkey: string,
    previousEventId: string,
  ): { state: ChessState } {
    const newState = { ...state };
    // Move piece, update castling rights, etc.
    newState.turn = {
      index: state.turn.index + 1,
      activePlayer: this.getOpponent(state, playerPubkey),
      timestamp: Date.now(),
      lastMoveHash: previousEventId,
    };
    newState.moveHistory = [...state.moveHistory, move];
    return { state: newState };
  }

  static isGameOver(state: ChessState): boolean {
    return isCheckmate(state) || isStalemate(state) || isDraw(state);
  }

  static endGame(state: ChessState): ChessState {
    const winner = isCheckmate(state)
      ? this.getOpponent(state, state.turn.activePlayer)
      : undefined;  // Draw
    return {
      ...state,
      meta: { ...state.meta, status: 'completed', winner },
    };
  }
}
```

## Adapting for Go

### Game State

```typescript
interface GoState {
  meta: GameMeta;
  turn: TurnInfo;
  // Go-specific
  boardSize: 9 | 13 | 19;
  stones: Record<string, 'B' | 'W'>;  // "x,y" => color
  captures: { black: number; white: number };
  komi: number;       // Compensation for white (usually 6.5)
  koPoint: string | null;  // Illegal to play (ko rule)
  consecutivePasses: number;
}

interface GoMove {
  x: number;
  y: number;
  // or 'pass'
  isPass?: boolean;
}
```

### Game Engine

```typescript
class GoEngine {
  static initializeGame(playerOne: string, playerTwo: string): GoState {
    return {
      meta: { gameId: uuidv4(), playerOne, playerTwo, status: 'active' },
      turn: { index: 0, activePlayer: playerOne, timestamp: Date.now(), lastMoveHash: '' },
      boardSize: 19,
      stones: {},
      captures: { black: 0, white: 0 },
      komi: 6.5,
      koPoint: null,
      consecutivePasses: 0,
    };
  }

  static validateMove(state: GoState, move: GoMove): ValidationResult {
    if (move.isPass) return { valid: true };

    const coord = `${move.x},${move.y}`;

    // Check spot is empty
    if (state.stones[coord]) {
      return { valid: false, error: 'Position occupied' };
    }

    // Check ko rule
    if (coord === state.koPoint) {
      return { valid: false, error: 'Ko violation' };
    }

    // Check suicide rule
    if (isSuicide(state, move)) {
      return { valid: false, error: 'Suicide move' };
    }

    return { valid: true };
  }

  static isGameOver(state: GoState): boolean {
    return state.consecutivePasses >= 2;
  }

  static endGame(state: GoState): GoState {
    // Score territory + captures + komi
    const { blackScore, whiteScore } = scoreGame(state);
    const winner = blackScore > whiteScore
      ? state.meta.playerOne
      : state.meta.playerTwo;
    return { ...state, meta: { ...state.meta, status: 'completed', winner } };
  }
}
```

## Platform Integration

### NostrSync Adapter

The platform's `NostrSync` class handles state transport:

```typescript
class NostrSync {
  constructor(
    private gameId: string,
    private opponentPubkey: string,
  ) {}

  // These methods work with any GameState conforming to the contract
  async publishGameState(state: GameStateBase, previousEventId: string): Promise<string>;
  async fetchLatestGameState(): Promise<{ event: NDKEvent; state: GameStateBase } | null>;
  subscribeToGameUpdates(onUpdate: Function, onError: Function): void;
  validateStateUpdate(current: GameStateBase, incoming: GameStateBase, eventId: string): ValidationResult;
}
```

### useGame Hook Pattern

```typescript
// Template for game-specific hook
function useYourGame() {
  const [gameState, setGameState] = useState<YourGameState | null>(null);
  const syncRef = useRef<NostrSync | null>(null);

  const createGame = async (opponentPubkey: string) => {
    const state = YourGameEngine.initializeGame(myPubkey, opponentPubkey);
    const gameId = state.meta.gameId;

    syncRef.current = new NostrSync(gameId, opponentPubkey);
    const eventId = await syncRef.current.publishGameState(state, '');

    setGameState(state);
    return gameId;
  };

  const makeMove = async (move: YourMove) => {
    const validation = YourGameEngine.validateMove(gameState!, move);
    if (!validation.valid) return validation;

    const { state: newState } = YourGameEngine.applyMove(
      gameState!,
      move,
      myPubkey,
      lastEventId,
    );

    await syncRef.current!.publishGameState(newState, lastEventId);
    setGameState(newState);

    return { valid: true };
  };

  // ... loadGame, resign, etc.

  return { gameState, createGame, makeMove };
}
```

## Checklist for New Games

- [ ] Define `YourGameState` extending `GameStateBase`
- [ ] Define `YourMove` type
- [ ] Implement `YourGameEngine` with all required methods
- [ ] Update d-tag prefix in `src/types/nostr.ts`
- [ ] Create `useYourGame` hook
- [ ] Build game-specific UI components
- [ ] Test move validation thoroughly
- [ ] Test state sync between two clients
- [ ] Implement resignation and abandonment
- [ ] Add browser notifications for turn changes
- [ ] Configure zap messages for your game

## Serialization Notes

### Keep State JSON-Serializable

All state must serialize to JSON for Nostr events:

```typescript
// Good
board: { "0,0": "X", "1,1": "O" }

// Bad (Map doesn't serialize)
board: new Map([["0,0", "X"], ["1,1", "O"]])
```

### Size Limits

Nostr events should be under 64KB. For complex games:

```typescript
// Compress move history
moveHistory: moves.slice(-50),  // Keep last 50 moves

// Use efficient notation
fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"

// Store deltas instead of full history
lastMove: { from: "e2", to: "e4" }
```

### Private State

For games with hidden information (poker, battleship):

```typescript
// Public state (both players see)
gameState.board = { /* visible pieces */ };

// Private state (only owner sees, separate d-tag)
await sync.savePlayerPrivateState({ hand: ["Ah", "Kd", "Qs"] });
```

## Error Handling

```typescript
// In game hook
const makeMove = async (move: Move) => {
  try {
    const validation = Engine.validateMove(gameState, move);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    const newState = Engine.applyMove(gameState, move, myPubkey, lastEventId);
    await sync.publishGameState(newState.state, lastEventId);

    setGameState(newState.state);
    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Move failed');
    // Optionally refresh state from relays
    const fresh = await sync.fetchLatestGameState();
    if (fresh) setGameState(fresh.state);
  }
};
```
