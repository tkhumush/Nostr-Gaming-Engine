import { nip44 } from "nostr-tools";
import { getCurrentUser } from "./client";

/**
 * NIP-44 encryption service
 * Uses browser extension (NIP-07) if available, otherwise falls back to nostr-tools
 */

export interface EncryptionProvider {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

/**
 * Get the NIP-44 encryption provider
 * Prefers browser extension, falls back to manual implementation
 */
export function getEncryptionProvider(): EncryptionProvider {
  // Check for NIP-07 extension with NIP-44 support
  if (typeof window !== "undefined" && window.nostr?.nip44) {
    return {
      encrypt: (pubkey: string, plaintext: string) =>
        window.nostr!.nip44!.encrypt(pubkey, plaintext),
      decrypt: (pubkey: string, ciphertext: string) =>
        window.nostr!.nip44!.decrypt(pubkey, ciphertext),
    };
  }

  // Fallback: manual encryption would require private key access
  // For security, we require NIP-07 extension for encryption
  throw new Error(
    "NIP-44 encryption requires a browser extension with NIP-44 support (e.g., Alby, nos2x)",
  );
}

/**
 * Encrypt a message for a recipient
 * @param recipientPubkey - The recipient's public key (hex)
 * @param plaintext - The message to encrypt
 */
export async function encryptMessage(
  recipientPubkey: string,
  plaintext: string,
): Promise<string> {
  const provider = getEncryptionProvider();
  return provider.encrypt(recipientPubkey, plaintext);
}

/**
 * Encrypt a direct message (kind 4) for a recipient using NIP-04.
 */
export async function encryptDirectMessage(
  recipientPubkey: string,
  plaintext: string,
): Promise<string> {
  if (typeof window !== "undefined") {
    const nostr = window.nostr as typeof window.nostr & {
      nip04?: {
        encrypt: (pubkey: string, plaintext: string) => Promise<string>;
      };
    };
    if (nostr?.nip04?.encrypt) {
      return nostr.nip04.encrypt(recipientPubkey, plaintext);
    }
  }
  throw new Error(
    "NIP-04 encryption requires a browser extension with NIP-04 support (e.g., Alby, nos2x)",
  );
}

/**
 * Decrypt a message from a sender
 * @param senderPubkey - The sender's public key (hex)
 * @param ciphertext - The encrypted message
 */
export async function decryptMessage(
  senderPubkey: string,
  ciphertext: string,
): Promise<string> {
  const provider = getEncryptionProvider();
  return provider.decrypt(senderPubkey, ciphertext);
}

/**
 * Encrypt game state for two players
 * The same encrypted content works for both because NIP-44 uses shared secret
 */
export async function encryptGameState<T>(
  opponentPubkey: string,
  state: T,
): Promise<string> {
  const plaintext = JSON.stringify(state);
  return encryptMessage(opponentPubkey, plaintext);
}

/**
 * Decrypt game state from an event
 */
export async function decryptGameState<T>(
  senderPubkey: string,
  encryptedContent: string,
): Promise<T> {
  const plaintext = await decryptMessage(senderPubkey, encryptedContent);
  return JSON.parse(plaintext) as T;
}

/**
 * Encrypt data to self (for player rack storage)
 */
export async function encryptToSelf<T>(data: T): Promise<string> {
  const user = getCurrentUser();
  if (!user?.pubkey) {
    throw new Error("Must be logged in to encrypt to self");
  }
  return encryptGameState(user.pubkey, data);
}

/**
 * Decrypt data from self
 */
export async function decryptFromSelf<T>(encryptedContent: string): Promise<T> {
  const user = getCurrentUser();
  if (!user?.pubkey) {
    throw new Error("Must be logged in to decrypt from self");
  }
  return decryptGameState(user.pubkey, encryptedContent);
}

/**
 * Generate a conversation key for NIP-44 (for reference)
 * In practice, the browser extension handles this internally
 */
export function generateConversationKey(
  privateKey: Uint8Array,
  publicKey: string,
): Uint8Array {
  return nip44.v2.utils.getConversationKey(privateKey, publicKey);
}
