# Real-Time Sync

## Purpose

Keep both players' views synchronized in real-time using Nostr subscriptions. When one player makes a move, the other receives the update within seconds.

## Current Implementation

### File: `src/nostr/NostrSync.ts`

### Subscription Setup

```typescript
// src/nostr/NostrSync.ts:229-296
subscribeToGameUpdates(
  onUpdate: (event: DecryptedGameEvent) => void,
  onError: (error: Error) => void,
  options: { heartbeatMs?: number } = {},
): void {
  this.subscriptionCallbacks = { onUpdate, onError };
  this.heartbeatMs = options.heartbeatMs || 0;

  this.startSubscription();

  if (this.heartbeatMs > 0) {
    this.startHeartbeat();
  }
}

private startSubscription(): void {
  const user = getCurrentUser();

  // Subscribe to game state events
  const filter: NDKFilter = {
    kinds: [GAME_KIND],
    "#d": [this.getGameDTag()],
    since: Math.floor(Date.now() / 1000) - 60,  // Last minute
  };

  const { unsubscribe } = subscribeToEvents(
    filter,
    async (event: NDKEvent) => {
      // Skip our own events
      if (event.pubkey === user.pubkey) return;

      try {
        const decryptKey = event.pubkey;  // Opponent's pubkey
        const plaintext = await decryptContent(decryptKey, event.content);
        const state: GameState = JSON.parse(plaintext);

        this.subscriptionCallbacks?.onUpdate({
          event: event as GameEvent,
          state,
        });
      } catch (error) {
        this.subscriptionCallbacks?.onError(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  );

  this.unsubscribe = unsubscribe;
}
```

### Heartbeat Reconnection

Relay connections can drop. The heartbeat restarts subscriptions periodically:

```typescript
// src/nostr/NostrSync.ts:286-296
private startHeartbeat(): void {
  if (!this.heartbeatMs || this.heartbeatMs <= 0) return;

  this.heartbeatTimer = setInterval(() => {
    if (!this.subscriptionCallbacks) return;

    // Restart subscription
    this.unsubscribeOnly();
    this.startSubscription();
  }, this.heartbeatMs);
}

private unsubscribeOnly(): void {
  if (this.unsubscribe) {
    this.unsubscribe();
    this.unsubscribe = null;
  }
}
```

### Subscription Cleanup

```typescript
// src/nostr/NostrSync.ts:302-312
stopSubscription(): void {
  // Clear heartbeat timer
  if (this.heartbeatTimer) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  // Unsubscribe from events
  this.unsubscribeOnly();
  this.subscriptionCallbacks = null;
}
```

### Polling Fallback

The `useGame` hook implements polling as a backup in case subscriptions miss events:

```typescript
// src/hooks/useGame.ts:248-270
// Set up polling as backup (every 15 seconds)
pollIntervalRef.current = setInterval(async () => {
  if (!syncRef.current) return;

  try {
    const latest = await syncRef.current.fetchLatestGameState();
    const currentEventId = lastEventIdRef.current;

    // Check if state changed
    if (latest && latest.event.id !== currentEventId) {
      setGameState(latest.state);
      setLastEventId(latest.event.id);

      // Also refresh the rack
      const rackData = await syncRef.current.fetchPlayerRack();
      if (rackData?.rack) {
        setPlayerRack(rackData.rack);
      }
    }
  } catch (err) {
    console.warn("Polling error:", err);
  }
}, 15000);
```

## Sync Flow Diagram

```
┌─────────────────┐                              ┌─────────────────┐
│    Player 1     │                              │    Player 2     │
│   (My Turn)     │                              │  (Waiting)      │
└────────┬────────┘                              └────────┬────────┘
         │                                                │
         │  1. Make move                                  │
         ▼                                                │
┌─────────────────┐                                       │
│ validateMove()  │                                       │
│ applyMove()     │                                       │
└────────┬────────┘                                       │
         │                                                │
         │  2. Publish state                              │
         ▼                                                │
┌─────────────────┐                              ┌────────┴────────┐
│ publishGameState│──────────────────────────────│   Subscription  │
│ Kind 30078      │          NOSTR RELAYS        │   receives      │
└────────┬────────┘              │               └────────┬────────┘
         │                       │                        │
         │                       │                        │  3. Decrypt
         │                       │                        ▼
         │                       │               ┌─────────────────┐
         │                       │               │ decryptContent()│
         │                       │               │ JSON.parse()    │
         │                       │               └────────┬────────┘
         │                       │                        │
         │                       │                        │  4. Update UI
         │                       │                        ▼
         │                       │               ┌─────────────────┐
         │                       │               │ onUpdate()      │
         │                       │               │ setGameState()  │
         │                       │               └─────────────────┘
         │                       │
         │  5. Save rack         │
         ▼                       │
┌─────────────────┐              │
│ savePlayerRack()│──────────────┘
│ Kind 30078      │
└─────────────────┘
```

## State Update Validation

```typescript
// src/nostr/NostrSync.ts:321-350
validateStateUpdate(
  currentState: GameState,
  incomingEvent: DecryptedGameEvent,
  currentEventId: string,
): { valid: boolean; error?: string } {
  const incomingState = incomingEvent.state;

  // Check turn incremented correctly
  if (incomingState.turn.index !== currentState.turn.index + 1) {
    return {
      valid: false,
      error: `Turn index mismatch: expected ${currentState.turn.index + 1}, got ${incomingState.turn.index}`,
    };
  }

  // Check move chain (event references previous)
  if (incomingState.turn.lastMoveHash !== currentEventId) {
    return {
      valid: false,
      error: "Event chain broken - lastMoveHash doesn't match",
    };
  }

  // Check it's the correct player's turn
  if (incomingEvent.event.pubkey !== currentState.turn.activePlayer) {
    return {
      valid: false,
      error: "Wrong player made move",
    };
  }

  return { valid: true };
}
```

## Browser Notifications

The `useGame` hook triggers browser notifications when turn changes:

```typescript
// src/hooks/useGame.ts:93-112
// Request notification permission on mount
useEffect(() => {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}, []);

// Send browser notification when it becomes your turn
useEffect(() => {
  if (prevIsMyTurnRef.current === false && isMyTurn === true) {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Words With Zaps", {
        body: "It's your turn!",
        icon: "/assets/wwz_logo_stack.svg",
      });
    }
  }
  prevIsMyTurnRef.current = isMyTurn;
}, [isMyTurn]);
```

## Game-Agnostic Interface

```typescript
interface RealtimeSync {
  // Subscribe to game updates
  subscribeToGameUpdates(
    onUpdate: (event: DecryptedGameEvent) => void,
    onError: (error: Error) => void,
    options?: {
      heartbeatMs?: number;  // Reconnection interval
    },
  ): void;

  // Stop subscription
  stopSubscription(): void;

  // Validate incoming state
  validateStateUpdate(
    currentState: GameState,
    incoming: DecryptedGameEvent,
    currentEventId: string,
  ): { valid: boolean; error?: string };
}
```

## Filter Design

### Game-Specific Filter

```typescript
const filter: NDKFilter = {
  kinds: [GAME_KIND],           // Kind 30078
  "#d": [gameTag],              // Specific game
  since: timestamp,             // Only recent events
};
```

### Why `since`?

Using `since` (1 minute ago) prevents receiving old events on reconnection:
- Without `since`: Every reconnection replays all historical events
- With `since`: Only receives events from the last minute

```typescript
since: Math.floor(Date.now() / 1000) - 60
```

## Handling Conflicts

### Race Condition Prevention

The `lastMoveHash` field creates an event chain:

```typescript
// Each move references the previous event
newState.turn.lastMoveHash = previousEventId;
```

If both players try to move simultaneously:
1. Both publish events referencing the same `previousEventId`
2. Validation rejects the later one (chain broken)
3. UI shows error, player must refresh

### Conflict Resolution

```typescript
// In handleGameUpdate callback
const validation = sync.validateStateUpdate(
  currentState,
  incomingEvent,
  currentEventId,
);

if (!validation.valid) {
  console.warn("Invalid state update:", validation.error);

  // Options:
  // 1. Ignore the invalid update
  // 2. Fetch fresh state from relays
  // 3. Show conflict resolution UI
  return;
}

// Valid update - apply it
setGameState(incomingEvent.state);
```

## Reuse Guidance for New Games

1. **Choose heartbeat interval** based on your game:
   - Fast-paced (30 second turns): 15-30s heartbeat
   - Slow-paced (days per turn): 60-120s heartbeat

   ```typescript
   sync.subscribeToGameUpdates(onUpdate, onError, {
     heartbeatMs: 30000,  // 30 second reconnection
   });
   ```

2. **Implement polling backup** for critical games:
   ```typescript
   // Don't rely solely on subscriptions
   setInterval(async () => {
     const latest = await sync.fetchLatestGameState();
     if (latest.event.id !== currentEventId) {
       // State changed, update UI
     }
   }, 15000);
   ```

3. **Add browser notifications** (with user permission):
   ```typescript
   useEffect(() => {
     if (isMyTurn && !wasMyTurn) {
       new Notification("Your Turn!", {
         body: "Your opponent made their move",
       });
     }
   }, [isMyTurn]);
   ```

4. **Handle offline/online transitions**:
   ```typescript
   window.addEventListener("online", () => {
     sync.stopSubscription();
     sync.subscribeToGameUpdates(onUpdate, onError);
   });
   ```

5. **Clean up on unmount**:
   ```typescript
   useEffect(() => {
     return () => {
       sync.stopSubscription();
       clearInterval(pollInterval);
     };
   }, []);
   ```

## Dependencies

- `@nostr-dev-kit/ndk` - Subscription management
- Browser Notification API - Turn notifications
