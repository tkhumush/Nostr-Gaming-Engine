# Relay Management

## Purpose

Manage connections to Nostr relays, handle user relay preferences (NIP-65), and ensure game events reach all relevant relays for both players.

## Current Implementation

### File: `src/nostr/client.ts`

### Default Relays

```typescript
// src/types/nostr.ts:51-58
export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.nostr.net",
  "wss://nostr.wine",
  "wss://relay.noswhere.com",
];
```

### NDK Initialization

```typescript
// src/nostr/client.ts:34-48
export async function initializeNDK(
  options: NostrClientOptions = {},
): Promise<NDK> {
  const relays = options.relays || DEFAULT_RELAYS;

  ndkInstance = new NDK({
    explicitRelayUrls: relays,
  });

  if (options.autoConnect !== false) {
    await ndkInstance.connect();
  }

  return ndkInstance;
}
```

### NIP-65 User Relay List

After authentication, the platform fetches the user's preferred relays:

```typescript
// src/nostr/client.ts:367-417
export async function fetchUserRelayList(pubkey: string): Promise<string[]> {
  // Check cache first
  const cached = userRelayCache.get(pubkey);
  if (cached) {
    return cached;
  }

  const ndk = getNDK();

  // Query kind:10002 relay list metadata
  const events = await ndk.fetchEvents({
    kinds: [RELAY_LIST_KIND],  // 10002
    authors: [pubkey],
    limit: 1,
  });

  if (events.size === 0) {
    return [];
  }

  const event = Array.from(events)[0];
  const writeRelays: string[] = [];

  // Parse relay tags - "r" tags with optional read/write marker
  event.tags.forEach((tag) => {
    if (tag[0] === "r") {
      const relay = tag[1];
      const permission = tag[2];

      // Include if no permission specified (both) or if explicitly "write"
      if (!permission || permission === "write") {
        writeRelays.push(relay);
      }
    }
  });

  // Cache the result
  if (writeRelays.length > 0) {
    userRelayCache.set(pubkey, writeRelays);
  }

  return writeRelays;
}
```

### Relay List Expansion

Combines user relays with pinned game relays and defaults:

```typescript
// src/nostr/client.ts:423-458
export function getExpandedRelayList(
  userRelays: string[],
  maxRelays: number = 12,
): string[] {
  const relaySet = new Set<string>();

  // Always include core game relays so existing games stay visible
  const pinnedRelays = [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://nos.lol",
  ];

  for (const relay of pinnedRelays) {
    const normalized = relay.trim().toLowerCase().replace(/\/+$/, "");
    relaySet.add(normalized);
  }

  // Add user relays next (more likely to have user's data)
  for (const relay of userRelays) {
    if (relaySet.size >= maxRelays) break;
    const normalized = relay.trim().toLowerCase().replace(/\/+$/, "");
    if (normalized.startsWith("wss://") || normalized.startsWith("ws://")) {
      relaySet.add(normalized);
    }
  }

  // Fill remaining slots with default relays
  for (const relay of DEFAULT_RELAYS) {
    if (relaySet.size >= maxRelays) break;
    const normalized = relay.trim().toLowerCase().replace(/\/+$/, "");
    relaySet.add(normalized);
  }

  return Array.from(relaySet);
}
```

### Dynamic Relay Addition

Add relays to the pool at runtime:

```typescript
// src/nostr/client.ts:463-482
export async function addRelaysToPool(relays: string[]): Promise<void> {
  const ndk = getNDK();

  for (const relay of relays) {
    const normalized = relay.trim().toLowerCase().replace(/\/+$/, "");
    const existingRelay = ndk.pool.relays.get(normalized);

    if (!existingRelay) {
      try {
        const ndkRelay = ndk.pool.getRelay(normalized, true);
        if (ndkRelay) {
          await ndkRelay.connect();
        }
      } catch (error) {
        console.warn(`Failed to connect to relay ${normalized}:`, error);
      }
    }
  }
}
```

### Connection Status

```typescript
// src/nostr/client.ts:515-550
export function getConnectedRelayCount(): number {
  if (!ndkInstance) return 0;
  try {
    return ndkInstance.pool.connectedRelays().length;
  } catch {
    return 0;
  }
}

export function getRelayUrls(): string[] {
  if (!ndkInstance) return [];
  try {
    return Array.from(ndkInstance.pool.relays.keys()).sort();
  } catch {
    return [];
  }
}

export function getConnectedRelayUrls(): string[] {
  if (!ndkInstance) return [];
  try {
    return ndkInstance.pool
      .connectedRelays()
      .map((relay) => relay.url)
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}
```

## Game-Agnostic Interface

```typescript
interface RelayManager {
  // Initialization
  initializeNDK(options?: { relays?: string[] }): Promise<NDK>;
  getNDK(): NDK;

  // User relay preferences (NIP-65)
  fetchUserRelayList(pubkey: string): Promise<string[]>;
  loadUserRelays(pubkey: string): Promise<string[]>;

  // Relay pool management
  getExpandedRelayList(userRelays: string[], maxRelays?: number): string[];
  addRelaysToPool(relays: string[]): Promise<void>;

  // Status
  getConnectedRelayCount(): number;
  getRelayUrls(): string[];
  getConnectedRelayUrls(): string[];

  // Cache
  clearRelayCache(): void;
}
```

## NIPs Used

| NIP | Purpose |
|-----|---------|
| NIP-65 | Relay list metadata (Kind 10002) |

## Connection Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     App Startup                                 │
│  1. initializeNDK() with DEFAULT_RELAYS                        │
│  2. Connect to initial relay pool                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     User Authentication                         │
│  1. connectWithNip07() / connectWithBunker() / etc.            │
│  2. loadUserRelays(pubkey) called in background                │
│     - Fetch Kind 10002 event                                   │
│     - Parse "r" tags for write relays                          │
│     - Cache results                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Relay Expansion                             │
│  1. getExpandedRelayList(userRelays)                           │
│     - Start with pinned game relays                            │
│     - Add user's write relays                                  │
│     - Fill with defaults up to maxRelays                       │
│  2. addRelaysToPool(expandedRelays)                            │
│     - Connect to any new relays                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Game Operations                             │
│  - Events published to all connected relays                    │
│  - Subscriptions receive from all connected relays             │
│  - NDK handles deduplication                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Relay Caching

User relay lists are cached to avoid repeated fetches:

```typescript
// src/nostr/client.ts:24
let userRelayCache: Map<string, string[]> = new Map();

// Cache is cleared on:
// - User logout (disconnect())
// - Explicit clearRelayCache() call
```

## Dependencies

- `@nostr-dev-kit/ndk` - Relay pool management

## Reuse Guidance for New Games

1. **Update pinned relays** if your game has different requirements:
   ```typescript
   const pinnedRelays = [
     "wss://relay.damus.io",  // High availability
     "wss://your-game-relay.com",  // Game-specific relay
   ];
   ```

2. **Consider relay requirements**:
   - Do both players need to see each other's events?
   - Are there geographic considerations?
   - Do you need a dedicated game relay?

3. **Relay normalization**: Always normalize relay URLs before comparison:
   ```typescript
   const normalized = url.trim().toLowerCase().replace(/\/+$/, "");
   ```

4. **Error handling**: Relay connections can fail. The platform handles this gracefully:
   ```typescript
   try {
     await ndkRelay.connect();
   } catch (error) {
     console.warn(`Failed to connect to relay ${normalized}:`, error);
     // Continue with other relays
   }
   ```

5. **Monitoring**: Use the status functions to show relay health in UI:
   ```tsx
   const { relayCount, connectedRelayUrls } = useNostr();

   return (
     <div>
       Connected to {relayCount} relays
       {connectedRelayUrls.map(url => <span key={url}>{url}</span>)}
     </div>
   );
   ```

## Configuration

Update default relays in `src/types/nostr.ts`:

```typescript
export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  // Add your game-specific relays here
];
```
