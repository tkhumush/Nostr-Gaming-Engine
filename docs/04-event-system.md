# Event System

## Purpose

Create, sign, publish, and subscribe to Nostr events. This is the foundation for all game state communication between players.

## Current Implementation

### File: `src/nostr/client.ts`

### Creating Events

```typescript
// src/nostr/client.ts:655-666
export function createEvent(
  kind: number,
  content: string,
  tags: string[][] = [],
): NDKEvent {
  const ndk = getNDK();
  const event = new NDKEvent(ndk);
  event.kind = kind;
  event.content = content;
  event.tags = tags;
  return event;
}
```

### Publishing Events

```typescript
// src/nostr/client.ts:645-650
export async function publishEvent(event: NDKEvent): Promise<void> {
  const ndk = getNDK();
  event.ndk = ndk;
  await event.sign();
  await event.publish();
}
```

### Subscribing to Events

Real-time subscription with callbacks:

```typescript
// src/nostr/client.ts:578-596
export function subscribeToEvents(
  filter: NDKFilter,
  onEvent: (event: NDKEvent) => void,
  onEose?: () => void,
): { unsubscribe: () => void } {
  const ndk = getNDK();
  const subscription = ndk.subscribe(filter, { closeOnEose: false });

  subscription.on("event", onEvent);
  if (onEose) {
    subscription.on("eose", onEose);
  }

  return {
    unsubscribe: () => {
      subscription.stop();
    },
  };
}
```

### Fetching Events (One-Time Query)

```typescript
// src/nostr/client.ts:607-640
const FETCH_EVENTS_TIMEOUT_MS = 6000;

export async function fetchEvents(filter: NDKFilter): Promise<NDKEvent[]> {
  const ndk = getNDK();

  return new Promise((resolve) => {
    const events = new Map<string, NDKEvent>();
    const subscription = ndk.subscribe(filter, { closeOnEose: true });
    let settled = false;

    const finalize = () => {
      if (settled) return;
      settled = true;
      subscription.stop();
      resolve(Array.from(events.values()));
    };

    // Timeout to avoid hanging if relays never send EOSE
    const timeoutId = setTimeout(() => {
      console.warn("fetchEvents timed out, returning partial results", filter);
      finalize();
    }, FETCH_EVENTS_TIMEOUT_MS);

    subscription.on("event", (event: NDKEvent) => {
      // Deduplicate by event key
      const dedupKey =
        typeof event.deduplicationKey === "function"
          ? event.deduplicationKey()
          : event.id;
      events.set(dedupKey, event);
    });

    subscription.on("eose", () => {
      clearTimeout(timeoutId);
      finalize();
    });
  });
}
```

## Event Kinds Used

| Kind | Purpose | NIP | Usage |
|------|---------|-----|-------|
| 0 | Profile metadata | NIP-01 | User profiles, lightning addresses |
| 5 | Event deletion | NIP-09 | Game deletion requests |
| 9734 | Zap request | NIP-57 | Move notifications |
| 10002 | Relay list | NIP-65 | User relay preferences |
| 23194 | NWC request | NIP-47 | Wallet operations |
| 23195 | NWC response | NIP-47 | Wallet operations |
| 27235 | HTTP auth | NIP-98 | Image uploads |
| 30078 | App-specific data | NIP-78 | Game state, rack, wallet backups |

## Game-Specific Event Structure

### Kind 30078 - Game State

```typescript
// src/types/nostr.ts:46-48
export const GAME_KIND = 30078;
export const GAME_D_TAG_PREFIX = "wordswithzaps_v1_";
export const RACK_D_TAG_PREFIX = "wordswithzaps_rack_";
```

Event structure:
```json
{
  "kind": 30078,
  "pubkey": "<player-who-published>",
  "created_at": 1234567890,
  "tags": [
    ["d", "wordswithzaps_v1_<game-uuid>"],
    ["p", "<player1-pubkey>"],
    ["p", "<player2-pubkey>"]
  ],
  "content": "<NIP-44-encrypted-game-state>",
  "sig": "..."
}
```

### Kind 5 - Deletion Request

```typescript
// src/nostr/NostrSync.ts:199-221
async publishDeletionForGame(reason: string = "Game deleted"): Promise<void> {
  const user = getCurrentUser();
  const dTag = this.getGameDTag();

  const events = await fetchEvents({
    kinds: [GAME_KIND],
    authors: [user.pubkey],
    "#d": [dTag],
    limit: 50,
  });

  const tags: string[][] = events.map((event) => ["e", event.id]);
  tags.push(["a", `${GAME_KIND}:${user.pubkey}:${dTag}`]);
  tags.push(["k", GAME_KIND.toString()]);

  const deletionEvent = createEvent(5, reason, tags);
  await publishEvent(deletionEvent);
}
```

## Game-Agnostic Interface

```typescript
interface EventSystem {
  // Event creation
  createEvent(kind: number, content: string, tags?: string[][]): NDKEvent;

  // Publishing
  publishEvent(event: NDKEvent): Promise<void>;

  // One-time queries
  fetchEvents(filter: NDKFilter): Promise<NDKEvent[]>;

  // Real-time subscriptions
  subscribeToEvents(
    filter: NDKFilter,
    onEvent: (event: NDKEvent) => void,
    onEose?: () => void,
  ): { unsubscribe: () => void };
}

// NDK Filter structure
interface NDKFilter {
  kinds?: number[];
  authors?: string[];
  ids?: string[];
  "#d"?: string[];
  "#p"?: string[];
  "#e"?: string[];
  since?: number;
  until?: number;
  limit?: number;
}
```

## Subscription Patterns

### Game State Subscription

```typescript
// src/nostr/NostrSync.ts:237-284
private startSubscription(): void {
  const user = getCurrentUser();

  const filter: NDKFilter = {
    kinds: [GAME_KIND],
    "#d": [this.getGameDTag()],
    since: Math.floor(Date.now() / 1000) - 60, // Last minute
  };

  const { unsubscribe } = subscribeToEvents(
    filter,
    async (event: NDKEvent) => {
      // Decrypt and validate incoming event
      const state = await decryptGameState(decryptKey, event.content);
      this.subscriptionCallbacks?.onUpdate({ event, state });
    },
  );

  this.unsubscribe = unsubscribe;
}
```

### Heartbeat Reconnection

To handle relay disconnections, the platform periodically restarts subscriptions:

```typescript
// src/nostr/NostrSync.ts:286-296
private startHeartbeat(): void {
  if (!this.heartbeatMs || this.heartbeatMs <= 0) return;

  this.heartbeatTimer = setInterval(() => {
    if (!this.subscriptionCallbacks) return;
    this.unsubscribeOnly();
    this.startSubscription();
  }, this.heartbeatMs);
}
```

Usage:
```typescript
sync.subscribeToGameUpdates(onUpdate, onError, { heartbeatMs: 45000 });
```

## NIPs Used

| NIP | Purpose |
|-----|---------|
| NIP-01 | Basic protocol, event structure |
| NIP-09 | Event deletion |
| NIP-78 | Application-specific data (Kind 30078) |

## Deduplication

NDK handles event deduplication using `deduplicationKey()`:
- For replaceable events (like Kind 30078), key is `kind:pubkey:d-tag`
- For regular events, key is the event ID

## Timeout Handling

The platform uses a 6-second timeout for fetches to avoid hanging:

```typescript
const FETCH_EVENTS_TIMEOUT_MS = 6000;

// If EOSE not received, return partial results
const timeoutId = setTimeout(() => {
  console.warn("fetchEvents timed out");
  finalize();
}, FETCH_EVENTS_TIMEOUT_MS);
```

## Reuse Guidance for New Games

1. **Update d-tag prefix** in `src/types/nostr.ts`:
   ```typescript
   export const GAME_D_TAG_PREFIX = "yourgame_v1_";
   export const RACK_D_TAG_PREFIX = "yourgame_rack_";
   // Or equivalent for your game's private state
   ```

2. **Filter by d-tag** to get your game's events:
   ```typescript
   const filter = {
     kinds: [GAME_KIND],
     "#d": [`yourgame_v1_${gameId}`],
   };
   ```

3. **Tag both players** for discoverability:
   ```typescript
   const event = createEvent(GAME_KIND, encryptedContent, [
     ["d", `yourgame_v1_${gameId}`],
     ["p", player1Pubkey],
     ["p", player2Pubkey],
   ]);
   ```

4. **Handle EOSE properly**: Always set up EOSE handlers or timeouts:
   ```typescript
   subscribeToEvents(
     filter,
     onEvent,
     () => console.log("Initial load complete")
   );
   ```

5. **Clean up subscriptions** on unmount:
   ```typescript
   useEffect(() => {
     const { unsubscribe } = subscribeToEvents(filter, onEvent);
     return () => unsubscribe();
   }, []);
   ```

## Dependencies

- `@nostr-dev-kit/ndk` - Event creation, signing, publishing, subscribing
