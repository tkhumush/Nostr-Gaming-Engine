# Encryption

## Purpose

Encrypt game state so only the two players can read it. Uses NIP-44 (XChaCha20-Poly1305) as the primary method with NIP-04 (AES-256-CBC) as a legacy fallback.

## Current Implementation

### File: `src/nostr/encryption.ts`

### NIP-44 Encryption (Primary)

```typescript
// src/nostr/encryption.ts:14-40
export async function encryptContent(
  recipientPubkey: string,
  plaintext: string,
): Promise<string> {
  // Use NIP-07 extension's encryption
  if (typeof window !== "undefined" && window.nostr) {
    // Prefer NIP-44 if available
    if (
      (window.nostr as { nip44?: unknown }).nip44 &&
      typeof (
        window.nostr as {
          nip44: { encrypt: (pubkey: string, plaintext: string) => Promise<string> };
        }
      ).nip44.encrypt === "function"
    ) {
      return (
        window.nostr as {
          nip44: { encrypt: (pubkey: string, plaintext: string) => Promise<string> };
        }
      ).nip44.encrypt(recipientPubkey, plaintext);
    }

    // Fall back to NIP-04 if NIP-44 not available
    if (window.nostr.nip04?.encrypt) {
      return window.nostr.nip04.encrypt(recipientPubkey, plaintext);
    }
  }

  throw new Error(
    "No encryption method available. Please use a NIP-07 extension.",
  );
}
```

### NIP-44 Decryption

```typescript
// src/nostr/encryption.ts:46-92
export async function decryptContent(
  senderPubkey: string,
  ciphertext: string,
): Promise<string> {
  if (typeof window !== "undefined" && window.nostr) {
    // NIP-44 format detection: NIP-04 uses ?iv= separator
    const isNip04Format = ciphertext.includes("?iv=");

    if (!isNip04Format) {
      // Try NIP-44 first
      if (
        (window.nostr as { nip44?: unknown }).nip44 &&
        typeof (
          window.nostr as {
            nip44: { decrypt: (pubkey: string, ciphertext: string) => Promise<string> };
          }
        ).nip44.decrypt === "function"
      ) {
        return (
          window.nostr as {
            nip44: { decrypt: (pubkey: string, ciphertext: string) => Promise<string> };
          }
        ).nip44.decrypt(senderPubkey, ciphertext);
      }
    }

    // Use NIP-04 for legacy format or as fallback
    if (window.nostr.nip04?.decrypt) {
      return window.nostr.nip04.decrypt(senderPubkey, ciphertext);
    }
  }

  throw new Error(
    "No decryption method available. Please use a NIP-07 extension.",
  );
}
```

### Format Detection

```typescript
// Detect which encryption format was used
const isNip04Format = ciphertext.includes("?iv=");
// NIP-04: base64ciphertext?iv=base64iv
// NIP-44: base64-encoded binary blob (no ?iv= separator)
```

## Encryption in Game Sync

### File: `src/nostr/NostrSync.ts`

Game state encryption between players:

```typescript
// src/nostr/NostrSync.ts:89-119
async publishGameState(
  state: GameState,
  previousEventId: string,
): Promise<string> {
  const user = getCurrentUser();

  // Serialize game state to JSON
  const plaintext = JSON.stringify(state);

  // Encrypt for the opponent (they can decrypt with their private key)
  const encryptedContent = await encryptContent(
    this.opponentPubkey,
    plaintext,
  );

  // Create and publish the event
  const event = createEvent(GAME_KIND, encryptedContent, [
    ["d", this.getGameDTag()],
    ["p", user.pubkey],
    ["p", this.opponentPubkey],
  ]);

  await publishEvent(event);
  return event.id!;
}
```

### Decryption on Receive

```typescript
// src/nostr/NostrSync.ts:136-156
async fetchLatestGameState(): Promise<DecryptedGameEvent | null> {
  const user = getCurrentUser();

  // Fetch the latest game state event
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#d": [this.getGameDTag()],
    limit: 1,
  });

  if (events.length === 0) return null;

  const event = events[0];

  // Determine decryption key based on who published
  const decryptKey =
    event.pubkey === user.pubkey ? this.opponentPubkey : event.pubkey;

  // Decrypt and parse
  const plaintext = await decryptContent(decryptKey, event.content);
  const state: GameState = JSON.parse(plaintext);

  return { event: event as GameEvent, state };
}
```

## Encryption Key Selection

In NIP-44/NIP-04 encryption between two parties:
- The **sender** encrypts using the **recipient's public key**
- The **recipient** decrypts using the **sender's public key**

This shared secret derivation means:
```
encrypt(sender_privkey, recipient_pubkey) → shared_secret
decrypt(recipient_privkey, sender_pubkey) → same shared_secret
```

When fetching game state:
```typescript
// Who should I use to derive the shared secret?
const decryptKey =
  event.pubkey === myPubkey
    ? opponentPubkey  // I published it, use opponent's pubkey
    : event.pubkey;   // Opponent published it, use their pubkey
```

## NIP Comparison

| Feature | NIP-04 | NIP-44 |
|---------|--------|--------|
| Cipher | AES-256-CBC | XChaCha20-Poly1305 |
| Authentication | None (CBC) | AEAD (Poly1305) |
| Padding Oracle | Vulnerable | N/A |
| Key Derivation | SHA256 | HKDF-SHA256 |
| IV/Nonce | 16 bytes | 24 bytes |
| Format | `base64?iv=base64` | Binary blob |
| Recommended | No (legacy) | Yes |

## Game-Agnostic Interface

```typescript
interface EncryptionProvider {
  // Encrypt plaintext for a recipient
  encryptContent(recipientPubkey: string, plaintext: string): Promise<string>;

  // Decrypt ciphertext from a sender
  decryptContent(senderPubkey: string, ciphertext: string): Promise<string>;

  // Check encryption support
  hasNip44Support(): boolean;
  hasNip04Support(): boolean;
}
```

## NIPs Used

| NIP | Purpose |
|-----|---------|
| NIP-04 | Legacy DM encryption (AES-256-CBC) |
| NIP-07 | Browser extension encryption interface |
| NIP-44 | Modern encryption (XChaCha20-Poly1305) |

## Wallet Backup Encryption

The same encryption is used for wallet backup to Nostr:

### NWC Backup (`src/wallet/nwcBackup.ts`)

```typescript
export async function backupNwcToNostr(
  pubkey: string,
  nwcConnectionString: string,
): Promise<NDKEvent> {
  // Encrypt connection string for self
  const { ciphertext, method } = await encrypt(pubkey, nwcConnectionString);

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = 30078;
  ndkEvent.content = ciphertext;
  ndkEvent.tags = [
    ["d", "zapcooking-nwc-backup"],
    ["encryption", method],  // "nip44" or "nip04"
  ];

  await ndkEvent.sign();
  await ndkEvent.publish();
}
```

### Spark Wallet Backup (`src/wallet/spark/backup.ts`)

```typescript
export async function backupSparkToNostr(
  pubkey: string,
  mnemonic?: string,
): Promise<NDKEvent> {
  // Only NIP-44 for seed phrases (more secure)
  if (!hasEncryptionSupport()) {
    throw new Error("NIP-44 encryption required for Spark backup");
  }

  const encryptedContent = await nip44.encrypt(pubkey, mnemonicToBackup);

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = 30078;
  ndkEvent.content = encryptedContent;
  ndkEvent.tags = [
    ["d", `spark-wallet-backup:${walletId}`],
    ["encryption", "nip44"],
  ];

  await ndkEvent.sign();
  await ndkEvent.publish();
}
```

## Local Storage Encryption

For local mnemonic storage, the platform uses Web Crypto AES-GCM:

```typescript
// src/wallet/spark/storage.ts
async function deriveKey(pubkey: string): Promise<CryptoKey> {
  const keyMaterial = sha256(hexToBytes(pubkey));
  return crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function saveMnemonic(pubkey: string, mnemonic: string): Promise<void> {
  const key = await deriveKey(pubkey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(mnemonic),
  );
  // Store iv + ciphertext as hex
}
```

## Reuse Guidance for New Games

1. **Always prefer NIP-44**: Check for support first:
   ```typescript
   if (window.nostr?.nip44?.encrypt) {
     // Use NIP-44
   } else if (window.nostr?.nip04?.encrypt) {
     // Fall back to NIP-04
   }
   ```

2. **Store encryption method** in event tags for future decryption:
   ```typescript
   tags: [
     ["encryption", "nip44"],
   ]
   ```

3. **Handle mixed encryption** in old games:
   ```typescript
   const method = event.tags.find(t => t[0] === "encryption")?.[1];
   if (method === "nip04" || ciphertext.includes("?iv=")) {
     return window.nostr.nip04.decrypt(pubkey, ciphertext);
   }
   return window.nostr.nip44.decrypt(pubkey, ciphertext);
   ```

4. **Error handling**: Decryption can fail if:
   - Wrong key used
   - Corrupted ciphertext
   - Extension doesn't support the encryption method

   ```typescript
   try {
     const plaintext = await decryptContent(pubkey, ciphertext);
   } catch (e) {
     console.error("Decryption failed:", e);
     // Handle gracefully - maybe re-fetch from relays
   }
   ```

## Dependencies

- `@nostr-dev-kit/ndk` - NDK signer integration
- `nostr-tools` - NIP-04 utilities
- `@noble/hashes` - SHA-256 for local key derivation
- Browser `crypto.subtle` - AES-GCM for local storage
