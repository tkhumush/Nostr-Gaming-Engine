# Wallet and Zaps

## Purpose

Integrate Lightning wallet functionality for payments and zaps. The platform supports multiple wallet types: NIP-47 Nostr Wallet Connect (NWC), Breez SDK Spark (self-custodial), and external wallets via Bitcoin Connect.

## Current Implementation

### Wallet Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Wallet Manager                              │
│                   src/wallet/walletManager.ts                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │               Unified API                                  │ │
│  │  • connectWallet()  • zapUser()  • refreshBalance()        │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   NWC Provider  │  │  Spark Provider │  │ Bitcoin Connect │
│ providers/nwc.ts│  │   spark/index.ts│  │ bitcoinConnect.ts│
│   (NIP-47)      │  │   (Breez SDK)   │  │   (External)    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Wallet Store

```typescript
// src/wallet/walletStore.ts
export interface Wallet {
  id: string;
  kind: WalletKind;  // NWC = 3, SPARK = 4
  name: string;
  active: boolean;
  data?: {
    connectionUrl?: string;  // NWC connection string
    hasMnemonic?: boolean;   // Spark has local wallet
  };
}

// State management
let wallets: Wallet[] = [];
let activeWallet: Wallet | null = null;
let balance: number | null = null;
let connected = false;
let loading = false;
```

## NIP-47 Nostr Wallet Connect

### File: `src/wallet/providers/nwc.ts`

### Connection URL Format

```
nostr+walletconnect://<wallet-pubkey>?relay=wss://...&secret=<hex>&lud16=user@domain.com
```

### Parsing Connection URL

```typescript
// src/wallet/providers/nwc.ts:33-67
export function parseNwcUrl(url: string): {
  pubkey: string;
  relay: string;
  secret: string;
  lud16?: string;
} | null {
  let cleaned = url.trim()
    .replace("nostr+walletconnect://", "")
    .replace("nostrwalletconnect://", "");

  const [pubkey, queryString] = cleaned.split("?");
  const params = new URLSearchParams(queryString);

  return {
    pubkey: pubkey.trim(),
    relay: params.get("relay")?.trim() || "",
    secret: params.get("secret")?.trim() || "",
    lud16: params.get("lud16")?.trim() || undefined,
  };
}
```

### NIP-47 Request Flow

```typescript
// src/wallet/providers/nwc.ts:292-382
async function executeNip47Request(
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const ndk = getNDK();
  const clientPubkey = getPublicKey(nwcSecret);

  // Create request content
  const content = JSON.stringify({ method, params });

  // Encrypt with NIP-04
  const encryptedContent = await nip04.encrypt(
    nwcSecret,
    nwcWalletPubkey,
    content,
  );

  // Create Kind 23194 request event
  const event = new NDKEvent(ndk);
  event.kind = 23194;
  event.content = encryptedContent;
  event.tags = [["p", nwcWalletPubkey]];

  // Sign with NWC secret key
  const signer = new NDKPrivateKeySigner(nwcSecret);
  await event.sign(signer);

  // Subscribe for response (Kind 23195)
  const sub = ndk.subscribe({
    kinds: [23195],
    authors: [nwcWalletPubkey],
    "#p": [clientPubkey],
    "#e": [event.id],
  });

  // Wait for response
  const response = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("NWC timeout")), 10000);

    sub.on("event", async (responseEvent) => {
      clearTimeout(timeout);
      const decrypted = await nip04.decrypt(nwcSecret, nwcWalletPubkey, responseEvent.content);
      const parsed = JSON.parse(decrypted);
      if (parsed.error) reject(new Error(parsed.error.message));
      else resolve(parsed.result);
    });
  });

  // Publish request
  await event.publish();

  return response;
}
```

### NWC Operations

```typescript
// Get balance (in sats)
export async function getNwcBalance(): Promise<number> {
  const result = await executeNip47Request("get_balance");
  return Math.floor((result.balance as number) / 1000);  // msats to sats
}

// Pay invoice
export async function payNwcInvoice(invoice: string): Promise<{ preimage: string }> {
  const result = await executeNip47Request("pay_invoice", { invoice });
  return { preimage: result.preimage as string };
}

// Create invoice
export async function createNwcInvoice(
  amountSats: number,
  description?: string,
): Promise<{ invoice: string; paymentHash: string }> {
  const result = await executeNip47Request("make_invoice", {
    amount: amountSats * 1000,  // sats to msats
    description: description || "Payment",
  });
  return { invoice: result.invoice, paymentHash: result.payment_hash };
}
```

## Breez SDK Spark (Self-Custodial)

### File: `src/wallet/spark/index.ts`

### Initialization

```typescript
// src/wallet/spark/index.ts:311-399
export async function initializeSdk(
  pubkey: string,
  mnemonic: string,
  apiKey: string,
): Promise<boolean> {
  // Initialize WASM
  const { default: init } = await import("@breeztech/breez-sdk-spark/web");
  await init();

  // Import SDK
  const { defaultConfig, connect } = await import("@breeztech/breez-sdk-spark/web");

  // Configure
  const config = defaultConfig("mainnet");
  config.apiKey = apiKey;

  // Connect wallet
  _sdkInstance = await connect({
    config,
    mnemonic: mnemonic.trim().toLowerCase(),
    storageDir: "yourgame-spark",
  });

  // Set up event listener for payments
  await setupEventListener();

  return true;
}
```

### Spark Operations

```typescript
// Create wallet with new mnemonic
export async function createAndConnectWallet(
  pubkey: string,
  apiKey: string,
): Promise<string> {
  const { generateMnemonic } = await import("bip39");
  const newMnemonic = generateMnemonic(128);  // 12 words

  await saveMnemonic(pubkey, newMnemonic);  // Encrypted local storage
  await initializeSdk(pubkey, newMnemonic, apiKey);

  return newMnemonic;
}

// Pay invoice or Lightning address
export async function sendSparkPayment(
  destination: string,
  amountSats?: number,
): Promise<{ preimage: string }> {
  const { parse } = await import("@breeztech/breez-sdk-spark/web");
  const parsedInput = await parse(destination);

  if (parsedInput.type === "lightningAddress" || parsedInput.type === "lnurlPay") {
    // LNURL flow
    const prepareResponse = await _sdkInstance.prepareLnurlPay({
      payRequest: parsedInput.payRequest,
      amountSats,
    });
    const payment = await _sdkInstance.lnurlPay({ prepareResponse });
    return { preimage: payment.preimage };
  }

  // BOLT11 invoice
  const prepareResponse = await _sdkInstance.prepareSendPayment({
    paymentRequest: destination,
    amountSat: amountSats,
  });
  const payment = await _sdkInstance.sendPayment({ prepareResponse });
  return { preimage: payment.preimage };
}

// Create receive invoice
export async function createSparkInvoice(
  amountSats: number,
  description?: string,
): Promise<{ invoice: string }> {
  const response = await _sdkInstance.receivePayment({
    paymentMethod: {
      type: "bolt11Invoice",
      amountSats,
      description: description || "Payment",
    },
  });
  return { invoice: response.paymentRequest };
}
```

### Mnemonic Storage

```typescript
// src/wallet/spark/storage.ts - Encrypted local storage
export async function saveMnemonic(pubkey: string, mnemonic: string): Promise<void> {
  const key = await deriveKey(pubkey);  // SHA256(pubkey) -> AES key
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(mnemonic),
  );

  localStorage.setItem(`spark_wallet_${pubkey}`, bytesToHex(iv + ciphertext));
}
```

## Zap Flow (NIP-57)

### File: `src/wallet/walletManager.ts`

```typescript
// src/wallet/walletManager.ts:280-360
export async function zapUser(params: ZapParams): Promise<string> {
  const { recipientPubkey, amountSats, gameId, moveDescription } = params;

  // 1. Get recipient's Lightning address
  const profile = await fetchProfile(recipientPubkey);
  const lightningAddress = profile.lud16 || profile.lud06;
  if (!lightningAddress) {
    throw new Error("Recipient has no Lightning address");
  }

  // 2. Resolve LNURL
  const [username, domain] = lightningAddress.split("@");
  const lnurlResponse = await fetch(
    `https://${domain}/.well-known/lnurlp/${username}`,
  );
  const lnurlData = await lnurlResponse.json();

  // 3. Create NIP-57 zap request
  const zapRequest = new NDKEvent(getNDK());
  zapRequest.kind = 9734;
  zapRequest.content = moveDescription;  // "Played QUIZ for 22 points"
  zapRequest.tags = [
    ["p", recipientPubkey],
    ["amount", String(amountSats * 1000)],  // msats
    ["relays", ...DEFAULT_RELAYS],
    ["e", gameId],  // Reference game event
  ];
  await zapRequest.sign();

  // 4. Fetch invoice from LNURL callback
  const callbackUrl = new URL(lnurlData.callback);
  callbackUrl.searchParams.set("amount", String(amountSats * 1000));
  callbackUrl.searchParams.set("nostr", JSON.stringify(zapRequest.rawEvent()));

  const invoiceResponse = await fetch(callbackUrl.toString());
  const invoiceData = await invoiceResponse.json();
  const invoice = invoiceData.pr;

  // 5. Pay the invoice
  const activeWallet = getActiveWallet();
  if (activeWallet.kind === WalletKind.NWC) {
    return (await payNwcInvoice(invoice)).preimage;
  } else if (activeWallet.kind === WalletKind.SPARK) {
    return (await sendSparkPayment(invoice)).preimage;
  }

  throw new Error("No wallet connected");
}
```

### Zap Parameters

```typescript
// src/types/wallet.ts:53-58
export interface ZapParams {
  recipientPubkey: string;
  amountSats: number;
  gameId: string;
  moveDescription: string;  // e.g., "Played QUIZ for 22 points"
}
```

## Wallet Backup to Nostr

### NWC Backup (`src/wallet/nwcBackup.ts`)

```typescript
export async function backupNwcToNostr(
  pubkey: string,
  nwcConnectionString: string,
): Promise<void> {
  const { ciphertext } = await encrypt(pubkey, nwcConnectionString);

  const event = new NDKEvent(getNDK());
  event.kind = 30078;
  event.content = ciphertext;
  event.tags = [
    ["d", "zapcooking-nwc-backup"],
    ["encryption", "nip44"],
  ];

  await event.sign();
  await event.publish();
}

export async function restoreNwcFromNostr(pubkey: string): Promise<string | null> {
  const events = await fetchEvents({
    kinds: [30078],
    authors: [pubkey],
    "#d": ["zapcooking-nwc-backup", "wordswithzaps-nwc-backup"],
  });

  if (events.length === 0) return null;

  const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
  return await decrypt(pubkey, latest.content);
}
```

### Spark Backup (`src/wallet/spark/backup.ts`)

```typescript
export async function backupSparkToNostr(
  pubkey: string,
  mnemonic?: string,
): Promise<void> {
  const mnemonicToBackup = mnemonic || await loadMnemonic(pubkey);
  const walletId = getSparkWalletId(mnemonicToBackup);  // First 16 chars of hash

  const encryptedContent = await nip44.encrypt(pubkey, mnemonicToBackup);

  const event = new NDKEvent(getNDK());
  event.kind = 30078;
  event.content = encryptedContent;
  event.tags = [
    ["d", `spark-wallet-backup:${walletId}`],
    ["encryption", "nip44"],
  ];

  await event.sign();
  await event.publish();
}
```

## React Hook: `useWallet`

### File: `src/hooks/useWallet.ts`

```typescript
export interface UseWalletReturn {
  // State
  state: WalletState;
  wallets: Wallet[];
  activeWallet: Wallet | null;

  // NWC
  connectNWC: (connectionUri: string) => Promise<void>;

  // Spark
  createSparkWallet: () => Promise<string>;  // Returns mnemonic
  importSparkWallet: (mnemonic: string) => Promise<void>;
  hasSparkWallet: boolean;

  // Bitcoin Connect
  bitcoinConnectEnabled: boolean;
  connectBitcoinConnect: () => Promise<void>;
  disconnectBitcoinConnect: () => Promise<void>;

  // General
  disconnect: (walletId?: string) => Promise<void>;
  setActiveWallet: (walletId: string) => Promise<void>;
  zapUser: (params: ZapParams) => Promise<string>;
  refreshBalance: (forceSync?: boolean) => Promise<void>;
  isReady: boolean;
}
```

## Game-Agnostic Interface

```typescript
interface WalletProvider {
  // Connection
  connect(config: WalletConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Balance
  getBalance(): Promise<number>;
  refreshBalance(forceSync?: boolean): Promise<void>;

  // Payments
  payInvoice(invoice: string): Promise<{ preimage: string }>;
  createInvoice(amountSats: number, description?: string): Promise<{ invoice: string }>;

  // Zaps
  zapUser(params: ZapParams): Promise<string>;

  // Backup
  backupToNostr(): Promise<void>;
  restoreFromNostr(): Promise<boolean>;
}
```

## NIPs Used

| NIP | Purpose |
|-----|---------|
| NIP-04 | NWC request/response encryption |
| NIP-47 | Nostr Wallet Connect protocol |
| NIP-57 | Zap requests |
| NIP-78 | Wallet backup storage |

## Reuse Guidance for New Games

1. **Copy wallet modules**: `src/wallet/` directory

2. **Configure Spark API key** (for self-custodial):
   ```bash
   # .env
   VITE_BREEZ_SPARK_API_KEY=your_api_key
   ```

3. **Update zap content** for your game:
   ```typescript
   const zapParams: ZapParams = {
     recipientPubkey: opponent.pubkey,
     amountSats: 21,
     gameId: currentGameId,
     moveDescription: "Checkmated in 15 moves!",  // Your game's message
   };
   ```

4. **Update backup d-tags** to avoid conflicts:
   ```typescript
   const NWC_BACKUP_D_TAG = "yourgame-nwc-backup";
   const SPARK_BACKUP_D_TAG = "yourgame-spark-backup";
   ```

5. **Implement wallet UI**:
   ```tsx
   function WalletConnect() {
     const { connectNWC, createSparkWallet, isReady } = useWallet();

     return (
       <div>
         <button onClick={() => connectNWC(prompt("NWC URL"))}>
           Connect NWC
         </button>
         <button onClick={async () => {
           const mnemonic = await createSparkWallet();
           alert(`Save your words: ${mnemonic}`);
         }}>
           Create Spark Wallet
         </button>
       </div>
     );
   }
   ```

## Dependencies

- `@nostr-dev-kit/ndk` - NWC communication
- `nostr-tools` - NIP-04 encryption, NIP-19 encoding
- `@breeztech/breez-sdk-spark` - Self-custodial wallet
- `@getalby/bitcoin-connect` - External wallet modal
- `bip39` - Mnemonic generation
