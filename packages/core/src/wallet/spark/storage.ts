/**
 * Spark Wallet Mnemonic Storage
 *
 * Securely stores the Breez SDK mnemonic in localStorage using AES-GCM encryption.
 * The encryption key is derived from the user's Nostr public key, tying the wallet to their identity.
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

const LOCAL_STORAGE_KEY_PREFIX = "spark_wallet_";

/**
 * Derives a CryptoKey for AES-GCM from the user's Nostr public key.
 * @param pubkey The user's Nostr public key (hex string).
 * @returns A CryptoKey for AES-GCM encryption/decryption.
 */
async function deriveKey(pubkey: string): Promise<CryptoKey> {
  // Hash pubkey with SHA-256 to get 32 bytes
  const pubkeyBytes = hexToBytes(pubkey);
  const keyMaterial = sha256(pubkeyBytes);

  // Create a fresh ArrayBuffer copy to satisfy TypeScript's strict typing
  const keyBuffer = new Uint8Array(keyMaterial).buffer as ArrayBuffer;

  // Import as AES-GCM key
  return crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Saves an encrypted mnemonic to local storage.
 * The mnemonic is encrypted using AES-GCM with a key derived from the Nostr pubkey.
 * @param pubkey The user's Nostr public key (hex string).
 * @param mnemonic The mnemonic string to encrypt and save.
 */
export async function saveMnemonic(
  pubkey: string,
  mnemonic: string,
): Promise<void> {
  const key = await deriveKey(pubkey);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM
  const plaintext = new TextEncoder().encode(mnemonic);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );

  // Store iv + ciphertext as a single hex string
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  localStorage.setItem(
    `${LOCAL_STORAGE_KEY_PREFIX}${pubkey}`,
    bytesToHex(combined),
  );
}

/**
 * Loads and decrypts a mnemonic from local storage.
 * @param pubkey The user's Nostr public key (hex string).
 * @returns The decrypted mnemonic string, or null if not found or decryption fails.
 */
export async function loadMnemonic(pubkey: string): Promise<string | null> {
  const storedDataHex = localStorage.getItem(
    `${LOCAL_STORAGE_KEY_PREFIX}${pubkey}`,
  );
  if (!storedDataHex) {
    return null;
  }

  try {
    const storedData = hexToBytes(storedDataHex);
    const iv = storedData.slice(0, 12);
    const ciphertext = storedData.slice(12);

    const key = await deriveKey(pubkey);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error("[Spark Storage] Failed to decrypt mnemonic:", error);
    return null;
  }
}

/**
 * Checks if a mnemonic exists in local storage for a given public key.
 * @param pubkey The user's Nostr public key (hex string).
 * @returns True if a mnemonic exists, false otherwise.
 */
export function hasMnemonic(pubkey: string): boolean {
  return localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${pubkey}`) !== null;
}

/**
 * Deletes a mnemonic from local storage for a given public key.
 * @param pubkey The user's Nostr public key (hex string).
 */
export function deleteMnemonic(pubkey: string): void {
  localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}${pubkey}`);
}

/**
 * Clears all Spark wallet mnemonics from local storage.
 */
export function clearAllSparkWallets(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LOCAL_STORAGE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export default {
  saveMnemonic,
  loadMnemonic,
  hasMnemonic,
  deleteMnemonic,
  clearAllSparkWallets,
};
