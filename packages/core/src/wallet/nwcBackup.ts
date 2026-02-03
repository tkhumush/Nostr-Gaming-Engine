/**
 * NWC Wallet Backup to Nostr Relays
 *
 * Backs up NWC connection strings to Nostr using NIP-78 (kind 30078)
 * with NIP-44 encryption (falls back to NIP-04).
 */

import { NDKEvent } from "@nostr-dev-kit/ndk";
import { getNDK } from "../nostr/client";

const NWC_BACKUP_EVENT_KIND = 30078;
// Support multiple d-tags for cross-app compatibility
const NWC_BACKUP_D_TAGS = [
  "zapcooking-nwc-backup", // zapcooking format (primary)
  "wordswithzaps-nwc-backup", // legacy wordswithzaps format
];
const NWC_BACKUP_D_TAG = NWC_BACKUP_D_TAGS[0]; // Use zapcooking format for new backups

type EncryptionMethod = "nip44" | "nip04";

/**
 * Check if NIP-44 encryption is available
 */
function hasNip44Support(): boolean {
  if (typeof window === "undefined" || !window.nostr) return false;
  return typeof (window.nostr as { nip44?: unknown }).nip44 !== "undefined";
}

/**
 * Check if NIP-04 encryption is available
 */
function hasNip04Support(): boolean {
  if (typeof window === "undefined" || !window.nostr) return false;
  return typeof (window.nostr as { nip04?: unknown }).nip04 !== "undefined";
}

/**
 * Check if any encryption method is available
 */
export function hasEncryptionSupport(): boolean {
  return hasNip44Support() || hasNip04Support();
}

/**
 * Get the best available encryption method
 */
function getBestEncryptionMethod(): EncryptionMethod | null {
  if (hasNip44Support()) return "nip44";
  if (hasNip04Support()) return "nip04";
  return null;
}

/**
 * Detect encryption method from ciphertext format
 */
function detectEncryptionMethod(ciphertext: string): EncryptionMethod {
  // NIP-04 format: base64?iv=base64
  if (ciphertext.includes("?iv=")) {
    return "nip04";
  }
  // NIP-44 uses a different format (no ?iv= separator)
  return "nip44";
}

/**
 * Encrypt content using NIP-07 extension
 */
async function encrypt(
  pubkey: string,
  plaintext: string,
): Promise<{ ciphertext: string; method: EncryptionMethod }> {
  const method = getBestEncryptionMethod();
  if (!method) {
    throw new Error("No encryption method available");
  }

  if (
    method === "nip44" &&
    (
      window.nostr as {
        nip44?: {
          encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        };
      }
    ).nip44
  ) {
    const ciphertext = await (
      window.nostr as {
        nip44: {
          encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        };
      }
    ).nip44.encrypt(pubkey, plaintext);
    return { ciphertext, method: "nip44" };
  }

  if (
    (
      window.nostr as {
        nip04?: {
          encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        };
      }
    ).nip04
  ) {
    const ciphertext = await (
      window.nostr as {
        nip04: {
          encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        };
      }
    ).nip04.encrypt(pubkey, plaintext);
    return { ciphertext, method: "nip04" };
  }

  throw new Error("Encryption failed");
}

/**
 * Decrypt content using NIP-07 extension
 */
async function decrypt(
  pubkey: string,
  ciphertext: string,
  method: EncryptionMethod,
): Promise<string> {
  if (
    method === "nip44" &&
    (
      window.nostr as {
        nip44?: {
          decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
        };
      }
    ).nip44
  ) {
    return await (
      window.nostr as {
        nip44: {
          decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
        };
      }
    ).nip44.decrypt(pubkey, ciphertext);
  }

  if (
    (
      window.nostr as {
        nip04?: {
          decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
        };
      }
    ).nip04
  ) {
    return await (
      window.nostr as {
        nip04: {
          decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
        };
      }
    ).nip04.decrypt(pubkey, ciphertext);
  }

  throw new Error("Decryption failed - no compatible method available");
}

/**
 * Backup NWC connection string to Nostr relays.
 * Uses NIP-78 (kind 30078) replaceable events with NIP-44/NIP-04 encryption.
 * @param pubkey The user's Nostr public key.
 * @param nwcConnectionString The NWC connection string to backup.
 */
export async function backupNwcToNostr(
  pubkey: string,
  nwcConnectionString: string,
): Promise<NDKEvent> {
  if (!nwcConnectionString) {
    throw new Error("No NWC connection string provided");
  }

  if (!hasEncryptionSupport()) {
    throw new Error(
      "No encryption method available. Please use a NIP-07 extension with encryption support.",
    );
  }

  const ndk = getNDK();

  // Encrypt the connection string
  console.log("[NWC Backup] Encrypting connection string...");
  const { ciphertext: encryptedContent, method: encryptionMethod } =
    await encrypt(pubkey, nwcConnectionString);
  console.log("[NWC Backup] Encrypted with", encryptionMethod);

  // Create the backup event
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = NWC_BACKUP_EVENT_KIND;
  ndkEvent.content = encryptedContent;
  ndkEvent.tags = [
    ["d", NWC_BACKUP_D_TAG],
    ["client", "wordswithzaps"],
    ["encryption", encryptionMethod],
  ];

  console.log("[NWC Backup] Signing backup event...");
  await ndkEvent.sign();

  console.log("[NWC Backup] Publishing backup to Nostr relays...");
  await ndkEvent.publish();

  console.log("[NWC Backup] NWC connection backed up to Nostr successfully");
  return ndkEvent;
}

/**
 * Restore NWC connection string from Nostr backup.
 * Fetches NIP-78 event and decrypts with NIP-44 or NIP-04.
 * @param pubkey The user's Nostr public key.
 * @returns The decrypted NWC connection string if found, null otherwise.
 */
export async function restoreNwcFromNostr(
  pubkey: string,
): Promise<string | null> {
  console.log(
    "[NWC Restore] Starting restore for pubkey:",
    pubkey.slice(0, 8) + "...",
  );

  if (!hasEncryptionSupport()) {
    throw new Error(
      "No decryption method available. Please use a NIP-07 extension with encryption support.",
    );
  }

  const ndk = getNDK();

  // Query for backup events with any supported d-tag
  console.log(
    "[NWC Restore] Searching for backups with d-tags:",
    NWC_BACKUP_D_TAGS,
  );

  let allEvents: NDKEvent[] = [];
  for (const dTag of NWC_BACKUP_D_TAGS) {
    const filter = {
      kinds: [NWC_BACKUP_EVENT_KIND],
      authors: [pubkey],
      "#d": [dTag],
    };
    const events = await ndk.fetchEvents(filter, { closeOnEose: true });
    if (events) {
      allEvents.push(...Array.from(events));
    }
  }
  console.log("[NWC Restore] Found", allEvents.length, "events");

  if (allEvents.length === 0) {
    console.log("[NWC Restore] No backup found on Nostr relays");
    return null;
  }

  // Get the most recent backup
  let latestEvent: NDKEvent | null = null;
  for (const event of allEvents) {
    if (
      !latestEvent ||
      (event.created_at || 0) > (latestEvent.created_at || 0)
    ) {
      latestEvent = event;
    }
  }

  if (!latestEvent || !latestEvent.content) {
    console.warn("[NWC Restore] Backup event found but has no content");
    return null;
  }

  // Determine encryption method from event tags or detect from ciphertext
  const encryptionTag = latestEvent.tags?.find((t) => t[0] === "encryption");
  let encryptionMethod: EncryptionMethod;
  if (encryptionTag?.[1] === "nip04" || encryptionTag?.[1] === "nip44") {
    encryptionMethod = encryptionTag[1] as EncryptionMethod;
  } else {
    encryptionMethod = detectEncryptionMethod(latestEvent.content);
  }
  console.log("[NWC Restore] Encryption method:", encryptionMethod);

  // Decrypt the connection string
  console.log("[NWC Restore] Starting decryption...");
  const connectionString = await decrypt(
    pubkey,
    latestEvent.content,
    encryptionMethod,
  );

  if (!connectionString) {
    throw new Error(
      "Failed to decrypt backup. Make sure you are using the same Nostr key.",
    );
  }

  // Validate it looks like an NWC connection string
  const isValidNwc =
    connectionString.includes("nostr+walletconnect") ||
    connectionString.includes("nostrwalletconnect");

  if (!isValidNwc) {
    console.error(
      "[NWC Restore] Invalid content preview:",
      connectionString.slice(0, 50),
    );
    throw new Error(
      "Decrypted data does not appear to be a valid NWC connection string.",
    );
  }

  console.log(
    "[NWC Restore] Successfully restored NWC connection from Nostr backup",
  );
  return connectionString;
}

/**
 * Check if an NWC backup exists on Nostr relays.
 * @param pubkey The user's Nostr public key.
 * @returns True if a backup exists, false otherwise.
 */
export async function hasNwcBackupOnNostr(pubkey: string): Promise<boolean> {
  try {
    const ndk = getNDK();

    // Check all supported d-tags for cross-app compatibility
    for (const dTag of NWC_BACKUP_D_TAGS) {
      const filter = {
        kinds: [NWC_BACKUP_EVENT_KIND],
        authors: [pubkey],
        "#d": [dTag],
      };

      const events = await ndk.fetchEvents(filter, { closeOnEose: true });

      // Check if any event has actual content (not deleted)
      if (events && events.size > 0) {
        for (const event of events) {
          if (event.content && !event.tags?.some((t) => t[0] === "deleted")) {
            return true;
          }
        }
      }
    }

    return false;
  } catch (e) {
    console.error("[NWC Backup] Error checking for backup:", e);
    return false;
  }
}

/**
 * Delete NWC wallet backup from Nostr relays.
 * Publishes an empty replaceable event to overwrite the backup.
 * @param pubkey The user's Nostr public key.
 */
export async function deleteNwcBackupFromNostr(_pubkey: string): Promise<void> {
  const ndk = getNDK();

  console.log(
    "[NWC Backup] Deleting backup by publishing empty replacement...",
  );

  // Create an empty replaceable event with the same d-tag to overwrite the backup
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = NWC_BACKUP_EVENT_KIND;
  ndkEvent.content = "";
  ndkEvent.tags = [
    ["d", NWC_BACKUP_D_TAG],
    ["deleted", "true"],
  ];

  await ndkEvent.sign();
  await ndkEvent.publish();

  console.log("[NWC Backup] Backup deleted (replaced with empty event)");
}

export default {
  backupNwcToNostr,
  restoreNwcFromNostr,
  hasNwcBackupOnNostr,
  deleteNwcBackupFromNostr,
  hasEncryptionSupport,
};
