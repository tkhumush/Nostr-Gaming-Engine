import NDK, {
  NDKEvent,
  NDKFilter,
  NDKUser,
  NDKNip07Signer,
  NDKPrivateKeySigner,
  NDKNip46Signer,
  type NostrEvent,
} from "@nostr-dev-kit/ndk";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import {
  BunkerSigner,
  createNostrConnectURI,
  type BunkerPointer,
} from "nostr-tools/nip46";
import { bytesToHex } from "@noble/hashes/utils";
import { DEFAULT_RELAYS, RELAY_LIST_KIND } from "../types/nostr";

let ndkInstance: NDK | null = null;
let currentUser: NDKUser | null = null;

// Cache for user relay lists
let userRelayCache: Map<string, string[]> = new Map();

export interface NostrClientOptions {
  relays?: string[];
  autoConnect?: boolean;
}

/**
 * Initialize NDK with optional custom relays
 */
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

/**
 * Get the current NDK instance (must be initialized first)
 */
export function getNDK(): NDK {
  if (!ndkInstance) {
    throw new Error("NDK not initialized. Call initializeNDK() first.");
  }
  return ndkInstance;
}

/**
 * Connect to NIP-07 browser extension (Alby, nos2x, etc.)
 */
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

/**
 * Generate a new Nostr keypair
 */
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

/**
 * Connect with a private key (hex format)
 */
export async function connectWithPrivateKey(
  privateKeyHex: string,
): Promise<NDKUser> {
  const ndk = getNDK();

  const signer = new NDKPrivateKeySigner(privateKeyHex);
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

/**
 * Connect with NIP-46 bunker URI
 */
export async function connectWithBunker(
  bunkerUri: string,
  localSignerKey?: string,
): Promise<{ user: NDKUser; localKey: string }> {
  const ndk = getNDK();

  // Use existing local signer key or generate new one
  const localSigner = localSignerKey
    ? new NDKPrivateKeySigner(localSignerKey)
    : NDKPrivateKeySigner.generate();

  // Create NIP-46 signer from bunker URI
  const nip46Signer = new NDKNip46Signer(ndk, bunkerUri, localSigner);

  // Wait for connection with timeout
  const user = await Promise.race([
    nip46Signer.blockUntilReady(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout (60s)")), 60000),
    ),
  ]);

  ndk.signer = nip46Signer;
  await user.fetchProfile();

  currentUser = user;

  // Load user's NIP-65 relays in background
  loadUserRelays(user.pubkey).catch((err) =>
    console.warn("Failed to load user relays:", err),
  );

  // Get the local signer's private key for persistence
  const localKey = localSignerKey || ((await localSigner.privateKey) as string);

  return { user, localKey };
}

// Store for active nostrconnect session
let activeNostrConnectSession: {
  uri: string;
  secretKey: Uint8Array;
  secret: string;
} | null = null;

/**
 * Generate a nostrconnect:// URI for remote signer to scan
 * Returns the URI and local signer key for later use
 */
export function generateNostrConnectURI(): {
  uri: string;
  localKeyHex: string;
  secret: string;
} {
  // Generate a local keypair for this connection
  const secretKey = generateSecretKey();
  const clientPubkey = getPublicKey(secretKey);
  const secret = bytesToHex(generateSecretKey()).substring(0, 16);

  // Use specific relays for nostrconnect - primal first for Primal app compatibility
  const nostrConnectRelays = [
    "wss://relay.primal.net",
    "wss://relay.damus.io",
    "wss://nos.lol",
  ];

  const uri = createNostrConnectURI({
    clientPubkey,
    relays: nostrConnectRelays,
    secret,
    name: "Words With Zaps",
    url:
      typeof window !== "undefined"
        ? window.location.origin
        : "https://wordswithzaps.top",
  });

  // Store session for later use
  activeNostrConnectSession = { uri, secretKey, secret };

  return {
    uri,
    localKeyHex: bytesToHex(secretKey),
    secret,
  };
}

/**
 * Wait for a nostrconnect response from remote signer using nostr-tools BunkerSigner
 */
export async function waitForNostrConnect(
  _localKeyHex: string,
  _expectedSecret: string,
  timeoutMs: number = 120000,
): Promise<{
  user: NDKUser;
  remotePubkey: string;
  bunkerPointer: BunkerPointer;
}> {
  const ndk = getNDK();

  if (!activeNostrConnectSession) {
    throw new Error("No active nostrconnect session");
  }

  const { uri, secretKey } = activeNostrConnectSession;

  // Use nostr-tools BunkerSigner.fromURI which properly handles the nostrconnect flow
  const bunkerSigner = await BunkerSigner.fromURI(
    secretKey,
    uri,
    {},
    timeoutMs,
  );

  // Get the user's public key from the remote signer
  const userPubkey = await bunkerSigner.getPublicKey();
  const remotePubkey = bunkerSigner.bp.pubkey;

  // Create a custom NDK signer that wraps the BunkerSigner
  ndk.signer = new BunkerSignerWrapper(bunkerSigner, userPubkey, ndk);

  // Get the user
  const user = ndk.getUser({ pubkey: userPubkey });
  await user.fetchProfile();

  currentUser = user;

  // Load user's NIP-65 relays in background
  loadUserRelays(user.pubkey).catch((err) =>
    console.warn("Failed to load user relays:", err),
  );

  // Clear the session
  activeNostrConnectSession = null;

  return { user, remotePubkey, bunkerPointer: bunkerSigner.bp };
}

/**
 * Custom NDK signer that wraps a nostr-tools BunkerSigner
 */
class BunkerSignerWrapper {
  private bunkerSigner: BunkerSigner;
  private ndkInstance: NDK;
  private _pubkey: string;
  private _user: NDKUser | null = null;

  constructor(bunkerSigner: BunkerSigner, userPubkey: string, ndk: NDK) {
    this.bunkerSigner = bunkerSigner;
    this._pubkey = userPubkey;
    this.ndkInstance = ndk;
    // Initialize _user immediately
    this._user = ndk.getUser({ pubkey: userPubkey });
  }

  // Required by NDKSigner interface - getter
  get pubkey(): string {
    return this._pubkey;
  }

  // Required by NDKSigner interface - getter
  get userSync(): NDKUser {
    if (!this._user) {
      this._user = this.ndkInstance.getUser({ pubkey: this._pubkey });
    }
    return this._user;
  }

  // Required by NDKSigner interface
  toPayload(): string {
    return JSON.stringify({
      type: "nip46-bunker",
      pubkey: this._pubkey,
      bunkerPubkey: this.bunkerSigner.bp.pubkey,
      relays: this.bunkerSigner.bp.relays,
    });
  }

  async blockUntilReady(): Promise<NDKUser> {
    if (!this._user) {
      this._user = this.ndkInstance.getUser({ pubkey: this._pubkey });
    }
    return this._user;
  }

  async user(): Promise<NDKUser> {
    if (!this._user) {
      this._user = this.ndkInstance.getUser({ pubkey: this._pubkey });
    }
    return this._user;
  }

  async sign(event: NostrEvent): Promise<string> {
    const eventTemplate = {
      kind: event.kind!,
      content: event.content!,
      tags: event.tags! as string[][],
      created_at: event.created_at!,
    };
    const signed = await this.bunkerSigner.signEvent(eventTemplate);
    return signed.sig;
  }

  async encrypt(recipient: NDKUser, value: string): Promise<string> {
    return this.bunkerSigner.nip44Encrypt(recipient.pubkey, value);
  }

  async decrypt(sender: NDKUser, value: string): Promise<string> {
    return this.bunkerSigner.nip44Decrypt(sender.pubkey, value);
  }
}

/**
 * Get the currently logged in user
 */
export function getCurrentUser(): NDKUser | null {
  return currentUser;
}

/**
 * Check if user is connected
 */
export function isConnected(): boolean {
  return currentUser !== null && ndkInstance !== null;
}

/**
 * Fetch user's relay list from Nostr (NIP-65 kind:10002)
 * Returns write relays that the user publishes to
 */
export async function fetchUserRelayList(pubkey: string): Promise<string[]> {
  // Check cache first
  const cached = userRelayCache.get(pubkey);
  if (cached) {
    return cached;
  }

  const ndk = getNDK();

  try {
    // Query kind:10002 relay list metadata
    const events = await ndk.fetchEvents({
      kinds: [RELAY_LIST_KIND],
      authors: [pubkey],
      limit: 1,
    });

    if (events.size === 0) {
      return [];
    }

    const event = Array.from(events)[0];
    const writeRelays: string[] = [];

    // Parse relay tags - "r" tags with optional read/write marker
    // No marker = both read and write
    // "read" = read only
    // "write" = write only
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
  } catch (error) {
    console.error("Failed to fetch relay list from Nostr:", error);
    return [];
  }
}

/**
 * Get expanded relay list combining user relays with defaults
 * Prioritizes user relays, fills remaining slots with defaults
 */
export function getExpandedRelayList(
  userRelays: string[],
  maxRelays: number = 12,
): string[] {
  const relaySet = new Set<string>();
  const pinnedRelays = [
    "wss://relay.damus.io",
    "wss://relay.primal.net",
    "wss://nos.lol",
  ];

  // Always include core game relays so existing games stay visible
  for (const relay of pinnedRelays) {
    const normalized = relay.trim().toLowerCase().replace(/\/+$/, "");
    relaySet.add(normalized);
  }

  // Add user relays next (more likely to have user's data)
  for (const relay of userRelays) {
    if (relaySet.size >= maxRelays) break;
    // Normalize: lowercase, remove trailing slashes
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

/**
 * Add relays to NDK pool dynamically
 */
export async function addRelaysToPool(relays: string[]): Promise<void> {
  const ndk = getNDK();

  for (const relay of relays) {
    const normalized = relay.trim().toLowerCase().replace(/\/+$/, "");
    // Check if relay is already in pool
    const existingRelay = ndk.pool.relays.get(normalized);
    if (!existingRelay) {
      try {
        // Add relay to pool
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

/**
 * Load and connect to user's NIP-65 relays after login
 * Call this after successful authentication
 */
export async function loadUserRelays(pubkey: string): Promise<string[]> {
  const userRelays = await fetchUserRelayList(pubkey);

  if (userRelays.length > 0) {
    console.log("Found user relays (NIP-65):", userRelays);
    // Get combined list with defaults
    const expandedRelays = getExpandedRelayList(userRelays);
    console.log("Expanded relays (NIP-65 + defaults):", expandedRelays);
    // Add any new relays to the pool
    await addRelaysToPool(expandedRelays);
    return expandedRelays;
  }

  console.log("No NIP-65 relays found, using defaults");
  return DEFAULT_RELAYS;
}

/**
 * Clear relay cache (call on logout)
 */
export function clearRelayCache(): void {
  userRelayCache.clear();
}

/**
 * Get count of connected relays
 */
export function getConnectedRelayCount(): number {
  if (!ndkInstance) return 0;
  try {
    return ndkInstance.pool.connectedRelays().length;
  } catch {
    return 0;
  }
}

/**
 * Get relay URLs currently in the NDK pool
 */
export function getRelayUrls(): string[] {
  if (!ndkInstance) return [];
  try {
    return Array.from(ndkInstance.pool.relays.keys()).sort();
  } catch {
    return [];
  }
}

/**
 * Get connected relay URLs
 */
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

/**
 * Disconnect from relays
 */
export function disconnect(): void {
  if (ndkInstance) {
    // NDK doesn't have a direct disconnect, but we can clear our references
    currentUser = null;
    ndkInstance.signer = undefined;
  }
  // Clear relay cache on disconnect
  clearRelayCache();
}

/**
 * Fetch a user's profile by pubkey
 */
export async function fetchUserProfile(pubkey: string): Promise<NDKUser> {
  const ndk = getNDK();
  const user = ndk.getUser({ pubkey });
  await user.fetchProfile();
  return user;
}

/**
 * Subscribe to events matching a filter
 */
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

/**
 * Fetch events matching a filter (one-time query)
 */
const FETCH_EVENTS_TIMEOUT_MS = 6000;

/**
 * Fetch events matching a filter (one-time query)
 * Uses a timeout to avoid hanging if relays never send EOSE.
 */
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

    const timeoutId = setTimeout(() => {
      console.warn("fetchEvents timed out, returning partial results", filter);
      finalize();
    }, FETCH_EVENTS_TIMEOUT_MS);

    subscription.on("event", (event: NDKEvent) => {
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

/**
 * Publish an event to relays
 */
export async function publishEvent(event: NDKEvent): Promise<void> {
  const ndk = getNDK();
  event.ndk = ndk;
  await event.sign();
  await event.publish();
}

/**
 * Create a new NDK event
 */
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

// Note: Window.nostr type is declared by @nostr-dev-kit/ndk
