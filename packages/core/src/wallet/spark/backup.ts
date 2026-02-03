/**
 * Spark Wallet Backup to Nostr Relays
 *
 * Backs up the Spark mnemonic to Nostr using NIP-78 (kind 30078)
 * with NIP-44 encryption only (NIP-04 not supported for security reasons).
 *
 * Compatible with jumble-spark and zapcooking backup formats.
 */

import { NDKEvent } from "@nostr-dev-kit/ndk";
import { getNDK } from "../../nostr/client";
import { loadMnemonic } from "./storage";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

const BACKUP_EVENT_KIND = 30078;
// Compatible with jumble-spark and zapcooking
const BACKUP_D_TAG = "spark-wallet-backup";
const BACKUP_D_TAG_PREFIX = `${BACKUP_D_TAG}:`;

export interface SparkBackupEntry {
  id: string;
  dTag: string;
  content: string;
  createdAt: number;
  encryptionMethod: "nip44" | "nip04";
  isLegacy: boolean;
  walletId?: string;
}

/**
 * Normalize mnemonic for consistent hashing
 */
function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Generate a wallet ID from mnemonic (first 16 chars of sha256 hash)
 * Compatible with zapcooking format
 */
export function getSparkWalletId(mnemonic: string): string {
  const normalized = normalizeMnemonic(mnemonic);
  const hash = sha256(new TextEncoder().encode(normalized));
  return bytesToHex(hash).slice(0, 16);
}

/**
 * Get the backup d-tag for a wallet
 */
function getBackupTag(walletId: string | null): string {
  return walletId ? `${BACKUP_D_TAG_PREFIX}${walletId}` : BACKUP_D_TAG;
}

/**
 * Parse a backup d-tag to extract wallet info
 */
function parseBackupTag(
  dTag: string,
): { isLegacy: boolean; walletId?: string } | null {
  if (dTag === BACKUP_D_TAG) {
    return { isLegacy: true };
  }
  if (dTag.startsWith(BACKUP_D_TAG_PREFIX)) {
    return {
      isLegacy: false,
      walletId: dTag.slice(BACKUP_D_TAG_PREFIX.length),
    };
  }
  return null;
}

/**
 * Check if NIP-44 encryption is available
 */
export function hasEncryptionSupport(): boolean {
  if (typeof window === "undefined" || !window.nostr) return false;
  return typeof (window.nostr as { nip44?: unknown }).nip44 !== "undefined";
}

/**
 * Detect encryption method from ciphertext format
 */
function detectEncryptionMethod(ciphertext: string): "nip44" | "nip04" {
  // NIP-04 format: base64?iv=base64
  if (ciphertext.includes("?iv=")) {
    return "nip04";
  }
  return "nip44";
}

/**
 * Encrypt content using NIP-44
 */
async function encrypt(pubkey: string, plaintext: string): Promise<string> {
  if (!hasEncryptionSupport()) {
    throw new Error("NIP-44 encryption not available");
  }

  const nip44 = (
    window.nostr as {
      nip44: {
        encrypt: (pubkey: string, plaintext: string) => Promise<string>;
      };
    }
  ).nip44;
  return await nip44.encrypt(pubkey, plaintext);
}

/**
 * Decrypt content using NIP-44
 */
async function decrypt(pubkey: string, ciphertext: string): Promise<string> {
  if (!hasEncryptionSupport()) {
    throw new Error("NIP-44 decryption not available");
  }

  const nip44 = (
    window.nostr as {
      nip44: {
        decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
      };
    }
  ).nip44;
  return await nip44.decrypt(pubkey, ciphertext);
}

/**
 * Check if an event is a deleted backup
 */
function isDeletedBackupEvent(event: NDKEvent): boolean {
  return (
    !!event.tags?.some((t) => t[0] === "deleted" && t[1] === "true") ||
    !event.content
  );
}

/**
 * Backup Spark mnemonic to Nostr relays.
 * Uses NIP-78 (kind 30078) replaceable events with NIP-44 encryption.
 * @param pubkey The user's Nostr public key.
 * @param mnemonic The mnemonic to backup (if not provided, loads from storage).
 */
export async function backupSparkToNostr(
  pubkey: string,
  mnemonic?: string,
): Promise<NDKEvent> {
  const mnemonicToBackup = mnemonic || (await loadMnemonic(pubkey));

  if (!mnemonicToBackup) {
    throw new Error("No mnemonic to backup");
  }

  if (!hasEncryptionSupport()) {
    throw new Error(
      "NIP-44 encryption not available. Please use a NIP-07 extension with NIP-44 support.",
    );
  }

  const ndk = getNDK();
  const walletId = getSparkWalletId(mnemonicToBackup);

  // Encrypt the mnemonic
  console.log("[Spark Backup] Encrypting mnemonic with NIP-44...");
  const encryptedContent = await encrypt(pubkey, mnemonicToBackup);

  // Create the backup event
  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = BACKUP_EVENT_KIND;
  ndkEvent.content = encryptedContent;
  ndkEvent.tags = [
    ["d", getBackupTag(walletId)],
    ["client", "wordswithzaps"],
    ["encryption", "nip44"],
  ];

  console.log("[Spark Backup] Signing backup event...");
  await ndkEvent.sign();

  console.log("[Spark Backup] Publishing backup to Nostr relays...");
  await ndkEvent.publish();

  console.log("[Spark Backup] Mnemonic backed up to Nostr successfully");
  return ndkEvent;
}

/**
 * List all Spark backups on Nostr relays.
 * Only returns NIP-44 encrypted backups (NIP-04 backups are ignored for security).
 * Returns list of backup entries sorted by creation date (newest first).
 * @param pubkey The user's Nostr public key.
 */
export async function listSparkBackups(
  pubkey: string,
): Promise<SparkBackupEntry[]> {
  console.log(
    "[Spark Backup] Listing backups for pubkey:",
    pubkey.slice(0, 8) + "...",
  );

  const ndk = getNDK();

  const filter = {
    kinds: [BACKUP_EVENT_KIND],
    authors: [pubkey],
  };

  const events = await ndk.fetchEvents(filter, { closeOnEose: true });

  if (!events || events.size === 0) {
    console.log("[Spark Backup] No backup events found");
    return [];
  }

  console.log("[Spark Backup] Found", events.size, "events");

  // Group by d-tag, keeping only the latest version of each
  const latestByTag = new Map<string, SparkBackupEntry>();

  for (const event of events) {
    const dTag = event.tags?.find((t) => t[0] === "d")?.[1];
    if (!dTag) continue;

    const parsed = parseBackupTag(dTag);
    if (!parsed) continue;

    if (!event.content || isDeletedBackupEvent(event)) continue;

    const createdAt = event.created_at || 0;
    const encryptionTag = event.tags?.find((t) => t[0] === "encryption");
    const encryptionMethod =
      (encryptionTag?.[1] as "nip44" | "nip04") ||
      detectEncryptionMethod(event.content);

    // Skip NIP-04 encrypted backups - require seed phrase restore for those
    if (encryptionMethod === "nip04") {
      console.log(
        "[Spark Backup] Skipping NIP-04 backup (use seed phrase restore):",
        dTag,
      );
      continue;
    }

    const entry: SparkBackupEntry = {
      id: event.id || `${dTag}:${createdAt}`,
      dTag,
      content: event.content,
      createdAt,
      encryptionMethod,
      isLegacy: parsed.isLegacy,
      walletId: parsed.walletId,
    };

    const existing = latestByTag.get(dTag);
    if (!existing || createdAt > existing.createdAt) {
      latestByTag.set(dTag, entry);
    }
  }

  const backups = Array.from(latestByTag.values()).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  console.log(
    "[Spark Backup] Found",
    backups.length,
    "NIP-44 encrypted backups",
  );
  return backups;
}

/**
 * Restore a specific Spark backup.
 * @param pubkey The user's Nostr public key.
 * @param backup The backup entry to restore.
 * @returns The decrypted mnemonic.
 */
export async function restoreSparkBackup(
  pubkey: string,
  backup: SparkBackupEntry,
): Promise<string> {
  console.log("[Spark Restore] Restoring backup:", backup.dTag);

  if (!hasEncryptionSupport()) {
    throw new Error(
      "NIP-44 decryption not available. Please use a NIP-07 extension with NIP-44 support.",
    );
  }

  if (backup.encryptionMethod === "nip04") {
    throw new Error(
      "This backup uses NIP-04 encryption which is no longer supported. Please restore using your recovery phrase.",
    );
  }

  // Decrypt the mnemonic
  console.log("[Spark Restore] Decrypting with NIP-44...");
  const mnemonic = await decrypt(pubkey, backup.content);

  if (!mnemonic) {
    throw new Error(
      "Failed to decrypt backup. Make sure you are using the same Nostr key.",
    );
  }

  // Basic validation - check it looks like a mnemonic
  const words = mnemonic.trim().split(/\s+/);
  const validWordCounts = [12, 15, 18, 21, 24];
  if (!validWordCounts.includes(words.length)) {
    throw new Error("Decrypted data does not appear to be a valid mnemonic.");
  }

  console.log("[Spark Restore] Successfully decrypted mnemonic");
  return mnemonic;
}

/**
 * Restore Spark mnemonic from Nostr backup.
 * If multiple backups exist, restores the most recent one.
 * @param pubkey The user's Nostr public key.
 * @returns The decrypted mnemonic if found, null otherwise.
 */
export async function restoreSparkFromNostr(
  pubkey: string,
): Promise<string | null> {
  const backups = await listSparkBackups(pubkey);

  if (backups.length === 0) {
    console.log("[Spark Restore] No NIP-44 backup found on Nostr relays");
    return null;
  }

  // Use the most recent backup
  return restoreSparkBackup(pubkey, backups[0]);
}

/**
 * Check if a Spark backup exists on Nostr relays.
 * Only checks for NIP-44 encrypted backups.
 * @param pubkey The user's Nostr public key.
 * @returns True if a backup exists, false otherwise.
 */
export async function hasSparkBackupOnNostr(pubkey: string): Promise<boolean> {
  try {
    const backups = await listSparkBackups(pubkey);
    return backups.length > 0;
  } catch (e) {
    console.error("[Spark Backup] Error checking for backup:", e);
    return false;
  }
}

/**
 * Delete Spark wallet backup from Nostr relays.
 * Publishes an empty replaceable event to overwrite the backup.
 * @param pubkey The user's Nostr public key.
 */
export async function deleteSparkBackupFromNostr(
  pubkey: string,
): Promise<void> {
  const ndk = getNDK();

  // Get wallet ID from stored mnemonic
  const mnemonic = await loadMnemonic(pubkey);
  const walletId = mnemonic ? getSparkWalletId(mnemonic) : null;

  console.log(
    "[Spark Backup] Deleting backup by publishing empty replacement...",
  );

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = BACKUP_EVENT_KIND;
  ndkEvent.content = "";
  ndkEvent.tags = [
    ["d", getBackupTag(walletId)],
    ["deleted", "true"],
  ];

  await ndkEvent.sign();
  await ndkEvent.publish();

  console.log("[Spark Backup] Backup deleted (replaced with empty event)");
}

export default {
  backupSparkToNostr,
  listSparkBackups,
  restoreSparkBackup,
  restoreSparkFromNostr,
  hasSparkBackupOnNostr,
  deleteSparkBackupFromNostr,
  hasEncryptionSupport,
  getSparkWalletId,
};
