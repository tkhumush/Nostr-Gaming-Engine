/**
 * React hooks for Nostr Gaming Engine
 *
 * useNostr - Authentication and connection state
 * useWallet - Wallet operations and zaps
 */

export { useNostr } from "./useNostr";
export type { UseNostrReturn, NostrConnectSession } from "./useNostr";

export { useWallet } from "./useWallet";
export type { UseWalletReturn } from "./useWallet";
