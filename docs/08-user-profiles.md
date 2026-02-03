# User Profiles

## Purpose

Fetch and display Nostr user profiles (Kind 0 metadata), search for users by name or NIP-05, and resolve Lightning addresses for zaps.

## Current Implementation

### File: `src/nostr/profiles.ts`

### Profile Type

```typescript
// src/types/nostr.ts:3-14
export interface NostrProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  about?: string;          // Bio
  picture?: string;        // Avatar URL
  banner?: string;         // Banner image URL
  nip05?: string;          // NIP-05 identifier (e.g., user@domain.com)
  website?: string;
  lud16?: string;          // Lightning address
  lud06?: string;          // LNURL
}
```

### Fetching a Single Profile

```typescript
// src/nostr/profiles.ts:18-54
export async function fetchProfile(pubkey: string): Promise<NostrProfile> {
  // Check cache first
  const cached = profileCache.get(pubkey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.profile;
  }

  const ndk = getNDK();

  // Fetch Kind 0 event
  const events = await ndk.fetchEvents({
    kinds: [0],
    authors: [pubkey],
    limit: 1,
  });

  if (events.size === 0) {
    // Return minimal profile with just pubkey
    return { pubkey };
  }

  const event = Array.from(events)[0];
  const metadata = JSON.parse(event.content);

  const profile: NostrProfile = {
    pubkey,
    name: metadata.name,
    displayName: metadata.display_name || metadata.displayName,
    about: metadata.about,
    picture: metadata.picture,
    banner: metadata.banner,
    nip05: metadata.nip05,
    website: metadata.website,
    lud16: metadata.lud16,
    lud06: metadata.lud06,
  };

  // Cache the result
  profileCache.set(pubkey, { profile, timestamp: Date.now() });

  return profile;
}
```

### Profile Caching

```typescript
// src/nostr/profiles.ts:8-15
interface CachedProfile {
  profile: NostrProfile;
  timestamp: number;
}

const profileCache = new Map<string, CachedProfile>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

### Searching for Users

```typescript
// src/nostr/profiles.ts:60-120
export async function searchProfiles(
  query: string,
  limit: number = 20,
): Promise<NostrProfile[]> {
  const ndk = getNDK();
  const normalizedQuery = query.toLowerCase().trim();

  // Search by NIP-05 if query looks like an email
  if (normalizedQuery.includes("@")) {
    const profile = await resolveNip05(normalizedQuery);
    if (profile) return [profile];
  }

  // Search by npub if query starts with npub
  if (normalizedQuery.startsWith("npub")) {
    try {
      const { data: pubkey } = nip19.decode(normalizedQuery);
      const profile = await fetchProfile(pubkey as string);
      return [profile];
    } catch {
      // Invalid npub, continue with search
    }
  }

  // Search by hex pubkey if 64 characters
  if (/^[0-9a-f]{64}$/i.test(normalizedQuery)) {
    const profile = await fetchProfile(normalizedQuery);
    return [profile];
  }

  // Text search across multiple relays
  const searchRelays = ["wss://relay.nostr.band", "wss://search.nos.today"];

  const events = await ndk.fetchEvents(
    {
      kinds: [0],
      search: normalizedQuery,
      limit,
    },
    { pool: new NDKRelaySet(new Set(searchRelays.map(r => new NDKRelay(r))), ndk) },
  );

  const profiles: NostrProfile[] = [];
  for (const event of events) {
    try {
      const metadata = JSON.parse(event.content);
      profiles.push({
        pubkey: event.pubkey,
        name: metadata.name,
        displayName: metadata.display_name,
        picture: metadata.picture,
        nip05: metadata.nip05,
        lud16: metadata.lud16,
      });
    } catch {
      // Skip invalid profile
    }
  }

  return profiles;
}
```

### NIP-05 Resolution

```typescript
// src/nostr/profiles.ts:125-165
export async function resolveNip05(nip05: string): Promise<NostrProfile | null> {
  const [username, domain] = nip05.toLowerCase().split("@");
  if (!username || !domain) return null;

  try {
    // Fetch .well-known/nostr.json
    const response = await fetch(
      `https://${domain}/.well-known/nostr.json?name=${username}`,
    );

    if (!response.ok) return null;

    const data = await response.json();
    const pubkey = data.names?.[username];

    if (!pubkey) return null;

    // Fetch full profile
    const profile = await fetchProfile(pubkey);
    return { ...profile, nip05 };
  } catch {
    return null;
  }
}
```

### Lightning Address Resolution

```typescript
// src/nostr/profiles.ts:170-200
export async function getLightningAddress(
  pubkey: string,
): Promise<string | null> {
  const profile = await fetchProfile(pubkey);

  // Prefer lud16 (user@domain.com format)
  if (profile.lud16) {
    return profile.lud16;
  }

  // Fall back to lud06 (LNURL format)
  if (profile.lud06) {
    // Convert LNURL to Lightning address if possible
    return decodeLnurl(profile.lud06);
  }

  return null;
}

function decodeLnurl(lnurl: string): string | null {
  try {
    // LNURL is bech32 encoded
    const { words } = bech32.decode(lnurl, 1023);
    const data = bech32.fromWords(words);
    const url = new TextDecoder().decode(new Uint8Array(data));

    // Extract domain and username from URL if possible
    // https://domain.com/.well-known/lnurlp/username
    const match = url.match(/https?:\/\/([^/]+)\/.well-known\/lnurlp\/(.+)/);
    if (match) {
      return `${match[2]}@${match[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}
```

### Display Name Helper

```typescript
// src/nostr/profiles.ts:205-215
export function getDisplayName(profile: NostrProfile): string {
  // Priority: displayName > name > truncated pubkey
  if (profile.displayName) return profile.displayName;
  if (profile.name) return profile.name;

  // Truncate pubkey: npub1abc...xyz
  const npub = nip19.npubEncode(profile.pubkey);
  return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
}
```

## Profile Event Structure (Kind 0)

```json
{
  "kind": 0,
  "pubkey": "...",
  "content": "{\"name\":\"alice\",\"display_name\":\"Alice\",\"about\":\"Hello!\",\"picture\":\"https://...\",\"lud16\":\"alice@getalby.com\"}",
  "tags": [],
  "created_at": 1234567890
}
```

## Game-Agnostic Interface

```typescript
interface ProfileProvider {
  // Single profile fetch
  fetchProfile(pubkey: string): Promise<NostrProfile>;

  // Batch fetch
  fetchProfiles(pubkeys: string[]): Promise<Map<string, NostrProfile>>;

  // Search
  searchProfiles(query: string, limit?: number): Promise<NostrProfile[]>;

  // NIP-05 resolution
  resolveNip05(nip05: string): Promise<NostrProfile | null>;

  // Lightning
  getLightningAddress(pubkey: string): Promise<string | null>;

  // Display helpers
  getDisplayName(profile: NostrProfile): string;

  // Cache management
  clearProfileCache(): void;
}
```

## NIPs Used

| NIP | Purpose |
|-----|---------|
| NIP-01 | Kind 0 profile metadata |
| NIP-05 | DNS-based verification |
| NIP-19 | npub/nsec encoding |
| NIP-50 | Search capability (relay-dependent) |

## Caching Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Profile Request                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   Check Memory Cache   │
              │   (5 minute TTL)       │
              └────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
      Cache Hit                      Cache Miss
            │                             │
            ▼                             ▼
   ┌─────────────────┐         ┌─────────────────┐
   │  Return Cached  │         │  Fetch from     │
   │     Profile     │         │  Nostr Relays   │
   └─────────────────┘         └────────┬────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │  Update Cache   │
                               │  Return Profile │
                               └─────────────────┘
```

## Reuse Guidance for New Games

1. **Copy the profiles module**: `src/nostr/profiles.ts`

2. **Update cache TTL** based on your needs:
   ```typescript
   // For games where profile changes matter less
   const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
   ```

3. **Add batch fetching** for game lobbies:
   ```typescript
   async function fetchProfiles(pubkeys: string[]): Promise<Map<string, NostrProfile>> {
     const results = new Map();
     const uncached = pubkeys.filter(pk => !profileCache.has(pk));

     if (uncached.length > 0) {
       const events = await ndk.fetchEvents({
         kinds: [0],
         authors: uncached,
       });
       // Process and cache...
     }

     return results;
   }
   ```

4. **Display opponent info** in game UI:
   ```tsx
   function OpponentInfo({ pubkey }: { pubkey: string }) {
     const [profile, setProfile] = useState<NostrProfile | null>(null);

     useEffect(() => {
       fetchProfile(pubkey).then(setProfile);
     }, [pubkey]);

     if (!profile) return <Skeleton />;

     return (
       <div>
         <img src={profile.picture} alt={getDisplayName(profile)} />
         <span>{getDisplayName(profile)}</span>
       </div>
     );
   }
   ```

5. **Handle missing profiles** gracefully:
   ```typescript
   const name = profile.displayName || profile.name || `${pubkey.slice(0, 8)}...`;
   const avatar = profile.picture || "/default-avatar.png";
   ```

## Image Upload (NIP-98)

### File: `src/nostr/imageUpload.ts`

For profile picture uploads:

```typescript
export async function uploadImage(file: File): Promise<string> {
  const ndk = getNDK();
  const user = getCurrentUser();

  // Create NIP-98 auth event
  const authEvent = new NDKEvent(ndk);
  authEvent.kind = 27235;
  authEvent.content = "";
  authEvent.tags = [
    ["u", "https://nostr.build/api/v2/upload/files"],
    ["method", "POST"],
  ];
  await authEvent.sign();

  // Upload with auth header
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("https://nostr.build/api/v2/upload/files", {
    method: "POST",
    headers: {
      Authorization: `Nostr ${btoa(JSON.stringify(authEvent.rawEvent()))}`,
    },
    body: formData,
  });

  const data = await response.json();
  return data.data[0].url;
}
```

## Dependencies

- `@nostr-dev-kit/ndk` - Event fetching
- `nostr-tools` - NIP-19 encoding
- `bech32` - LNURL decoding
