# Authentication and Identity

## Purpose

Handle user authentication via Nostr public keys. The platform supports three authentication methods, allowing users to log in with browser extensions, remote signers, or private keys.

## Current Implementation

### File: `src/nostr/client.ts`

The client module manages NDK initialization and provides multiple authentication strategies.

### Authentication Methods

#### 1. NIP-07 Browser Extension (Recommended)

Users authenticate via browser extensions like Alby or nos2x.

```typescript
// src/nostr/client.ts:63-84
export async function connectWithNip07(): Promise<NDKUser> {
  const ndk = getNDK();

  if (typeof window === "undefined" || !window.nostr) {
    throw new Error("No NIP-07 extension found. Please install Alby or nos2x.");
  }

  const signer = new NDKNip07Signer();
  ndk.signer = signer;

  const user = await signer.user();
  await user.fetchProfile();

  currentUser = user;

  // Load user's NIP-65 relays in background
  loadUserRelays(user.pubkey).catch((err) =>
    console.warn("Failed to load user relays:", err),
  );

  return user;
}
```

#### 2. Private Key Authentication

For users without extensions or for programmatic access.

```typescript
// src/nostr/client.ts:112-131
export async function connectWithPrivateKey(
  privateKeyHex: string,
): Promise<NDKUser> {
  const ndk = getNDK();

  const signer = new NDKPrivateKeySigner(privateKeyHex);
  ndk.signer = signer;

  const user = await signer.user();
  await user.fetchProfile();

  currentUser = user;
  loadUserRelays(user.pubkey).catch(console.warn);

  return user;
}
```

#### 3. NIP-46 Remote Signer (Bunker)

For mobile users with remote signers like Amber or Primal.

```typescript
// src/nostr/client.ts:136-172
export async function connectWithBunker(
  bunkerUri: string,
  localSignerKey?: string,
): Promise<{ user: NDKUser; localKey: string }> {
  const ndk = getNDK();

  const localSigner = localSignerKey
    ? new NDKPrivateKeySigner(localSignerKey)
    : NDKPrivateKeySigner.generate();

  const nip46Signer = new NDKNip46Signer(ndk, bunkerUri, localSigner);

  const user = await Promise.race([
    nip46Signer.blockUntilReady(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout (60s)")), 60000),
    ),
  ]);

  ndk.signer = nip46Signer;
  await user.fetchProfile();
  currentUser = user;

  const localKey = localSignerKey || ((await localSigner.privateKey) as string);
  return { user, localKey };
}
```

#### NostrConnect QR Flow

For mobile apps, generate a QR code that the remote signer scans:

```typescript
// src/nostr/client.ts:185-221
export function generateNostrConnectURI(): {
  uri: string;
  localKeyHex: string;
  secret: string;
} {
  const secretKey = generateSecretKey();
  const clientPubkey = getPublicKey(secretKey);
  const secret = bytesToHex(generateSecretKey()).substring(0, 16);

  const nostrConnectRelays = [
    "wss://relay.primal.net",
    "wss://relay.damus.io",
    "wss://nos.lol",
  ];

  const uri = createNostrConnectURI({
    clientPubkey,
    relays: nostrConnectRelays,
    secret,
    name: "Words With Zaps",  // Replace with your app name
    url: window.location.origin,
  });

  return { uri, localKeyHex: bytesToHex(secretKey), secret };
}

// Wait for connection after QR scan
export async function waitForNostrConnect(
  _localKeyHex: string,
  _expectedSecret: string,
  timeoutMs: number = 120000,
): Promise<{ user: NDKUser; remotePubkey: string; bunkerPointer: BunkerPointer }> {
  // Uses nostr-tools BunkerSigner for the connection flow
  const bunkerSigner = await BunkerSigner.fromURI(secretKey, uri, {}, timeoutMs);
  const userPubkey = await bunkerSigner.getPublicKey();

  // Wrap in custom class for NDK compatibility
  ndk.signer = new BunkerSignerWrapper(bunkerSigner, userPubkey, ndk);
  // ...
}
```

### Keypair Generation

For creating new accounts:

```typescript
// src/nostr/client.ts:89-107
export function generateKeypair(): {
  secretKeyHex: string;
  pubkey: string;
  nsec: string;
  npub: string;
} {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const secretKeyHex = Array.from(secretKey)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    secretKeyHex,
    pubkey,
    nsec: nip19.nsecEncode(secretKey),
    npub: nip19.npubEncode(pubkey),
  };
}
```

### Session Persistence

Session state is persisted in localStorage:

```typescript
// src/hooks/useNostr.ts:46-51
const AUTO_CONNECT_KEY = "wwz_autoconnect";
const LAST_PUBKEY_KEY = "wwz_last_pubkey";
const AUTH_METHOD_KEY = "wwz_auth_method";
const PRIVATE_KEY_KEY = "wwz_private_key";
const NIP46_BUNKER_KEY = "wwz_nip46_bunker";
const NIP46_LOCAL_KEY = "wwz_nip46_local_key";
```

## Game-Agnostic Interface

```typescript
interface AuthenticationProvider {
  // Initialize NDK with relay configuration
  initializeNDK(options?: { relays?: string[] }): Promise<NDK>;

  // Browser extension authentication
  connectWithNip07(): Promise<User>;

  // Private key authentication
  connectWithPrivateKey(hexKey: string): Promise<User>;

  // Remote signer authentication
  connectWithBunker(uri: string, localKey?: string): Promise<{
    user: User;
    localKey: string;
  }>;

  // Generate keypair for new accounts
  generateKeypair(): {
    secretKeyHex: string;
    pubkey: string;
    nsec: string;
    npub: string;
  };

  // QR code flow for mobile signers
  generateNostrConnectURI(): {
    uri: string;
    localKeyHex: string;
    secret: string;
  };
  waitForNostrConnect(localKey: string, secret: string, timeout?: number): Promise<{
    user: User;
    remotePubkey: string;
  }>;

  // Session management
  getCurrentUser(): User | null;
  isConnected(): boolean;
  disconnect(): void;
}
```

## NIPs Used

| NIP | Purpose |
|-----|---------|
| NIP-01 | Basic protocol, public key identity |
| NIP-07 | Browser extension signing interface |
| NIP-19 | Bech32-encoded entities (nsec, npub) |
| NIP-46 | Remote signer protocol (Bunker) |
| NIP-65 | Relay list metadata (loaded after auth) |

## React Hook: `useNostr`

File: `src/hooks/useNostr.ts`

```typescript
export interface UseNostrReturn {
  user: NDKUser | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  authMethod: "nip07" | "private-key" | "nip46" | null;
  relayCount: number;

  // Methods
  connect: () => Promise<void>;  // NIP-07
  connectWithPrivateKey: (key: string) => Promise<void>;
  connectWithBunker: (uri: string) => Promise<void>;
  generateKeypair: () => { nsec: string; npub: string; secretKeyHex: string };
  startNostrConnect: () => Promise<NostrConnectSession>;
  waitForNostrConnect: (session: NostrConnectSession) => Promise<void>;
  cancelNostrConnect: () => void;
  disconnect: () => void;
}
```

## Dependencies

- `@nostr-dev-kit/ndk` - NDK client and signers
- `nostr-tools` - Key generation, NIP-19 encoding, NIP-46 utilities
- `@noble/hashes` - Cryptographic utilities

## Reuse Guidance for New Games

1. **Copy files**: `src/nostr/client.ts`, `src/hooks/useNostr.ts`

2. **Update localStorage keys** to avoid conflicts:
   ```typescript
   const AUTO_CONNECT_KEY = "yourgame_autoconnect";
   const AUTH_METHOD_KEY = "yourgame_auth_method";
   // etc.
   ```

3. **Update app name** in NostrConnect URI:
   ```typescript
   const uri = createNostrConnectURI({
     // ...
     name: "Your Game Name",
     url: "https://yourgame.com",
   });
   ```

4. **Use the hook** in your app:
   ```tsx
   function App() {
     const { user, isConnected, connect, disconnect } = useNostr();

     if (!isConnected) {
       return <LoginScreen onConnect={connect} />;
     }

     return <GameLobby user={user} />;
   }
   ```

## Security Considerations

1. **Private keys in localStorage**: The platform stores hex private keys in localStorage for private-key auth. Consider warning users about this.

2. **Mandatory backup**: When generating new keypairs, the reference implementation requires users to download a backup file before proceeding.

3. **NIP-46 local key**: For remote signer auth, a local signing key is stored to re-establish the connection on page refresh.

4. **Clear on logout**: All auth-related localStorage items are cleared on disconnect.
