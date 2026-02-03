# Multi-Player Games (Proposal)

> **Status**: Proposal - Not yet implemented

This document outlines a proposed design for supporting games with more than two players.

## Overview

The current engine supports two-player games. This proposal extends support to:

- **3-4 player games** - Scrabble, card games, party games
- **Team games** - 2v2, 3v3 configurations
- **Large groups** - Party games with 6+ players

## Use Cases

| Game Type | Players | Examples |
|-----------|---------|----------|
| Classic board games | 3-4 | Scrabble, Monopoly, Risk |
| Card games | 3-6 | Poker, Uno, Hearts |
| Team games | 4+ | Bridge, Spades, Team trivia |
| Party games | 6+ | Codenames, Werewolf |

## Design Challenges

### 1. Encryption Complexity

With two players, we encrypt once (A→B using NIP-44). With N players, we need:

**Option A: Pairwise Encryption**
- Encrypt game state to each player individually
- N-1 encryptions per publish
- Each player gets their own event

**Option B: Group Key**
- Generate shared symmetric key
- Distribute key to all players via NIP-44
- Encrypt game state once with shared key

**Option C: Threshold Encryption**
- Use multi-party encryption schemes
- More complex, better security guarantees

### 2. Turn Order

Two-player games alternate. Multi-player games need:

```typescript
interface TurnOrder {
  type: 'sequential' | 'simultaneous' | 'auction' | 'custom';
  currentPlayer: string;    // pubkey
  playerOrder: string[];    // array of pubkeys
  direction: 'clockwise' | 'counterclockwise';
}
```

### 3. Hidden Information

Different players may see different information:

```typescript
interface PlayerView {
  pubkey: string;
  visibleState: Partial<GameState>;  // What this player can see
  hiddenFromOthers: unknown;          // This player's private data
}
```

### 4. Consensus & Synchronization

With more players, state conflicts become more likely:

- Player A and B both try to play simultaneously
- Network partitions cause divergent states
- Need conflict resolution strategy

## Proposed Architecture

### Game State Structure

```typescript
interface MultiPlayerGameState {
  meta: {
    gameId: string;
    players: PlayerInfo[];      // Array instead of playerOne/playerTwo
    minPlayers: number;
    maxPlayers: number;
    status: 'waiting' | 'in_progress' | 'finished';
    teamConfig?: TeamConfig;
  };

  turn: {
    index: number;
    activePlayer: string;       // Current player's pubkey
    playerOrder: string[];      // Turn sequence
    turnType: TurnType;
    timestamp: number;
    lastMoveHash: string;
  };

  // Game-specific state
  publicState: unknown;         // Visible to all players
  privateStates: Map<string, unknown>;  // Per-player hidden state
}

interface PlayerInfo {
  pubkey: string;
  displayName?: string;
  joinedAt: number;
  status: 'active' | 'disconnected' | 'resigned';
  team?: string;
}

interface TeamConfig {
  teams: Team[];
  teamTurnOrder: 'alternating' | 'sequential';
}

interface Team {
  id: string;
  name: string;
  members: string[];  // pubkeys
}
```

### Group Key Distribution

We recommend using a shared symmetric key for group encryption:

```typescript
class MultiPlayerSync {
  private groupKey: Uint8Array;
  private gameId: string;
  private players: string[];

  static async create(
    gameId: string,
    players: string[]
  ): Promise<MultiPlayerSync> {
    const sync = new MultiPlayerSync();
    sync.gameId = gameId;
    sync.players = players;

    // Generate random group key
    sync.groupKey = crypto.getRandomValues(new Uint8Array(32));

    // Distribute key to all players via NIP-44
    await sync.distributeGroupKey();

    return sync;
  }

  private async distributeGroupKey(): Promise<void> {
    for (const playerPubkey of this.players) {
      // Encrypt group key to each player
      const encryptedKey = await encryptContent(
        JSON.stringify({
          gameId: this.gameId,
          groupKey: bytesToHex(this.groupKey),
          players: this.players,
        }),
        playerPubkey
      );

      // Publish as Kind 30078 with special d-tag
      await publishEvent({
        kind: 30078,
        tags: [
          ["d", `game_key_${this.gameId}_${playerPubkey}`],
          ["p", playerPubkey],
        ],
        content: encryptedKey,
      });
    }
  }

  async publishGameState(state: MultiPlayerGameState): Promise<string> {
    // Encrypt with group key (symmetric)
    const encrypted = await encryptSymmetric(
      JSON.stringify(state),
      this.groupKey
    );

    const event = await publishEvent({
      kind: 30078,
      tags: [
        ["d", `game_v1_${this.gameId}`],
        ...this.players.map(p => ["p", p]),
        ["player_count", this.players.length.toString()],
      ],
      content: encrypted,
    });

    return event.id;
  }
}
```

### Event Tags

Multi-player events use additional tags:

```json
{
  "kind": 30078,
  "tags": [
    ["d", "game_v1_{gameId}"],
    ["p", "player1_pubkey"],
    ["p", "player2_pubkey"],
    ["p", "player3_pubkey"],
    ["p", "player4_pubkey"],
    ["player_count", "4"],
    ["min_players", "3"],
    ["max_players", "4"],
    ["turn_type", "sequential"],
    ["active_player", "player2_pubkey"]
  ],
  "content": "<encrypted game state>"
}
```

### Turn Management

```typescript
type TurnType =
  | 'sequential'      // One player at a time, in order
  | 'simultaneous'    // All players act at once (reveal together)
  | 'auction'         // Anyone can act, first valid move wins
  | 'team_sequential' // Teams alternate, players within team choose
  | 'custom';         // Game defines its own logic

interface TurnManager {
  getCurrentPlayer(state: MultiPlayerGameState): string;
  getNextPlayer(state: MultiPlayerGameState): string;
  canPlayerAct(state: MultiPlayerGameState, pubkey: string): boolean;
  advanceTurn(state: MultiPlayerGameState): MultiPlayerGameState;
}

// Sequential turn implementation
class SequentialTurnManager implements TurnManager {
  getCurrentPlayer(state: MultiPlayerGameState): string {
    return state.turn.activePlayer;
  }

  getNextPlayer(state: MultiPlayerGameState): string {
    const order = state.turn.playerOrder;
    const currentIndex = order.indexOf(state.turn.activePlayer);
    const nextIndex = (currentIndex + 1) % order.length;
    return order[nextIndex];
  }

  canPlayerAct(state: MultiPlayerGameState, pubkey: string): boolean {
    return state.turn.activePlayer === pubkey;
  }

  advanceTurn(state: MultiPlayerGameState): MultiPlayerGameState {
    return {
      ...state,
      turn: {
        ...state.turn,
        index: state.turn.index + 1,
        activePlayer: this.getNextPlayer(state),
      },
    };
  }
}

// Simultaneous turn implementation
class SimultaneousTurnManager implements TurnManager {
  private pendingMoves: Map<string, unknown> = new Map();

  canPlayerAct(state: MultiPlayerGameState, pubkey: string): boolean {
    // All players can act if they haven't submitted yet
    return !this.pendingMoves.has(pubkey);
  }

  submitMove(pubkey: string, move: unknown): void {
    this.pendingMoves.set(pubkey, move);

    // Check if all players have submitted
    if (this.pendingMoves.size === state.meta.players.length) {
      this.revealMoves();
    }
  }

  private revealMoves(): void {
    // Apply all moves simultaneously
    // Publish revealed state
  }
}
```

### Player Joining Flow

For games that allow late joining:

```typescript
interface LobbyState {
  gameId: string;
  host: string;           // Creator's pubkey
  players: PlayerInfo[];
  minPlayers: number;
  maxPlayers: number;
  status: 'open' | 'starting' | 'in_progress' | 'closed';
  settings: GameSettings;
}

class GameLobby {
  async create(settings: GameSettings): Promise<LobbyState> {
    const gameId = uuid();
    const currentUser = getCurrentUser();

    const lobby: LobbyState = {
      gameId,
      host: currentUser.pubkey,
      players: [{
        pubkey: currentUser.pubkey,
        joinedAt: Date.now(),
        status: 'active',
      }],
      minPlayers: settings.minPlayers,
      maxPlayers: settings.maxPlayers,
      status: 'open',
      settings,
    };

    await this.publishLobbyState(lobby);
    return lobby;
  }

  async join(gameId: string): Promise<void> {
    const currentUser = getCurrentUser();

    // Publish join request
    await publishEvent({
      kind: 30078,
      tags: [
        ["d", `game_join_${gameId}_${currentUser.pubkey}`],
        ["g", gameId],
        ["e", "join_request"],
      ],
      content: JSON.stringify({
        pubkey: currentUser.pubkey,
        timestamp: Date.now(),
      }),
    });
  }

  async approvePlayer(gameId: string, playerPubkey: string): Promise<void> {
    // Host approves a player
    // Update lobby state with new player
    // Distribute group key to new player
  }

  async startGame(gameId: string): Promise<void> {
    // Verify minimum players
    // Generate and distribute group key
    // Initialize game state
    // Publish initial state
  }
}
```

### React Hook

```typescript
interface UseMultiPlayerGameReturn {
  state: MultiPlayerGameState | null;
  players: PlayerInfo[];
  isMyTurn: boolean;
  myPlayerIndex: number;
  makeMove: (move: unknown) => Promise<void>;
  pass: () => Promise<void>;
  resign: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

function useMultiPlayerGame(gameId: string): UseMultiPlayerGameReturn {
  const [state, setState] = useState<MultiPlayerGameState | null>(null);
  const [sync, setSync] = useState<MultiPlayerSync | null>(null);

  useEffect(() => {
    const initSync = async () => {
      // Fetch group key
      const groupKey = await fetchGroupKey(gameId);
      const players = await fetchGamePlayers(gameId);

      const newSync = new MultiPlayerSync(gameId, players, groupKey);
      newSync.subscribe((event) => {
        const decrypted = decryptSymmetric(event.content, groupKey);
        setState(JSON.parse(decrypted));
      });

      setSync(newSync);
    };

    initSync();
  }, [gameId]);

  const currentUser = getCurrentUser();
  const isMyTurn = state?.turn.activePlayer === currentUser?.pubkey;
  const myPlayerIndex = state?.meta.players.findIndex(
    p => p.pubkey === currentUser?.pubkey
  ) ?? -1;

  const makeMove = async (move: unknown) => {
    if (!sync || !state || !isMyTurn) return;

    const newState = applyMove(state, move, currentUser.pubkey);
    await sync.publishGameState(newState);
  };

  return {
    state,
    players: state?.meta.players ?? [],
    isMyTurn,
    myPlayerIndex,
    makeMove,
    pass: () => makeMove({ type: 'pass' }),
    resign: () => makeMove({ type: 'resign' }),
    loading: !state,
    error: null,
  };
}
```

## Team Games

For team-based games (Bridge, team trivia):

```typescript
interface TeamGameState extends MultiPlayerGameState {
  meta: MultiPlayerGameState['meta'] & {
    teamConfig: {
      teams: Team[];
      teamScores: Map<string, number>;
      teamTurnOrder: 'alternating' | 'sequential';
    };
  };
}

// Team-aware turn management
class TeamTurnManager implements TurnManager {
  getCurrentTeam(state: TeamGameState): Team {
    const activePlayer = state.turn.activePlayer;
    return state.meta.teamConfig.teams.find(
      t => t.members.includes(activePlayer)
    )!;
  }

  getNextTeam(state: TeamGameState): Team {
    const teams = state.meta.teamConfig.teams;
    const currentTeam = this.getCurrentTeam(state);
    const currentIndex = teams.indexOf(currentTeam);
    return teams[(currentIndex + 1) % teams.length];
  }

  canTeammateAct(state: TeamGameState, pubkey: string): boolean {
    // In some games, teammates can act for each other
    const playerTeam = state.meta.teamConfig.teams.find(
      t => t.members.includes(pubkey)
    );
    const activeTeam = this.getCurrentTeam(state);
    return playerTeam?.id === activeTeam.id;
  }
}
```

## Notifications

Extend notification system for multiple players:

```typescript
async function notifyNextPlayer(
  state: MultiPlayerGameState,
  move: MoveDescription
): Promise<void> {
  const nextPlayer = getNextPlayer(state);
  const currentUser = getCurrentUser();

  // Send DM notification
  await sendDirectMessage(nextPlayer, {
    type: 'your_turn',
    gameId: state.meta.gameId,
    from: currentUser.pubkey,
    message: `${getDisplayName(currentUser)} played. Your turn!`,
    moveDescription: move.description,
  });

  // Optional: zap notification
  if (state.meta.settings.zapNotifications) {
    await zapUser({
      recipientPubkey: nextPlayer,
      amountSats: state.meta.settings.zapAmount,
      gameId: state.meta.gameId,
      moveDescription: move.description,
    });
  }
}

// Notify all players (for simultaneous games)
async function notifyAllPlayers(
  state: MultiPlayerGameState,
  message: string
): Promise<void> {
  const currentUser = getCurrentUser();
  const otherPlayers = state.meta.players.filter(
    p => p.pubkey !== currentUser.pubkey
  );

  await Promise.all(
    otherPlayers.map(player =>
      sendDirectMessage(player.pubkey, {
        type: 'game_update',
        gameId: state.meta.gameId,
        message,
      })
    )
  );
}
```

## Conflict Resolution

With multiple players, state conflicts are more likely:

```typescript
interface ConflictResolver {
  detectConflict(
    localState: MultiPlayerGameState,
    remoteEvent: NostrEvent
  ): boolean;

  resolveConflict(
    localState: MultiPlayerGameState,
    remoteState: MultiPlayerGameState
  ): MultiPlayerGameState;
}

class TurnBasedConflictResolver implements ConflictResolver {
  detectConflict(local: MultiPlayerGameState, remote: NostrEvent): boolean {
    const remoteState = JSON.parse(decrypt(remote.content));

    // Conflict if same turn index but different moves
    return (
      local.turn.index === remoteState.turn.index &&
      local.turn.lastMoveHash !== remoteState.turn.lastMoveHash
    );
  }

  resolveConflict(
    local: MultiPlayerGameState,
    remote: MultiPlayerGameState
  ): MultiPlayerGameState {
    // Use timestamp as tiebreaker
    // Earlier timestamp wins
    if (local.turn.timestamp <= remote.turn.timestamp) {
      return local;
    }
    return remote;
  }
}
```

## Migration Path

1. Extend `GameMeta` interface to support player arrays
2. Implement `MultiPlayerSync` class with group key distribution
3. Create turn management system with different strategies
4. Build lobby system for player joining
5. Update notification system for multiple recipients
6. Add conflict resolution logic
7. Create example 4-player game (Scrabble variant)

## Open Questions

1. How do we handle player disconnection mid-game?
2. Should there be a time limit per turn with auto-skip?
3. How do we prevent collusion in team games?
4. What's the maximum practical number of players?
5. How do we handle player replacement (substitutes)?
