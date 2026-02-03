/**
 * @nostr-gaming-engine/core
 *
 * Platform for building P2P turn-based games on Nostr with Lightning payments.
 *
 * @example
 * ```typescript
 * import { NostrSync, useNostr, useWallet } from '@nostr-gaming-engine/core';
 *
 * // Create a game sync instance
 * const sync = new NostrSync(gameId, opponentPubkey);
 * await sync.publishGameState(state, previousEventId);
 * ```
 */

// Nostr infrastructure
export {
  initializeNDK,
  getNDK,
  connectWithNip07,
  connectWithPrivateKey,
  connectWithBunker,
  generateKeypair,
  generateNostrConnectURI,
  waitForNostrConnect,
  getCurrentUser,
  isConnected,
  disconnect,
  fetchUserRelayList,
  loadUserRelays,
  getExpandedRelayList,
  addRelaysToPool,
  getConnectedRelayCount,
  getRelayUrls,
  getConnectedRelayUrls,
  createEvent,
  publishEvent,
  fetchEvents,
  subscribeToEvents,
} from "./nostr/client";

export { NostrSync } from "./nostr/NostrSync";
export type { DecryptedGameEvent, GameEvent } from "./nostr/NostrSync";

export { encryptContent, decryptContent, encryptDirectMessage } from "./nostr/encryption";

export {
  fetchProfile,
  fetchProfileMetadata,
  searchProfiles,
  resolveNip05,
  getLightningAddress,
  getDisplayName,
  normalizePubkey,
  updateProfile,
  updateProfileLightningAddress,
} from "./nostr/profiles";

export { fetchUserGames, deleteGame, fetchGamePlayers } from "./nostr/games";
export type { GameSummary } from "./nostr/games";

export { uploadImage, createNip98AuthHeader } from "./nostr/imageUpload";

// Wallet integration
export {
  initializeWalletManager,
  connectWallet,
  disconnectWallet,
  refreshBalance,
  zapUser,
  isWalletReady,
  getWalletStoreState,
  subscribeToWalletStore,
  isValidNwcUrl,
  hasSparkMnemonic,
  sendPayment,
  createInvoice,
  getTransactionHistory,
} from "./wallet/walletManager";

export {
  getWallets,
  getActiveWallet,
  setActiveWallet,
  addWallet,
  removeWallet,
} from "./wallet/walletStore";

export {
  connectNwc,
  disconnectNwc,
  getNwcBalance,
  payNwcInvoice,
  createNwcInvoice,
  isNwcConnected,
  getNwcDisplayName,
  getNwcConnectionUrl,
  getNwcLud16,
} from "./wallet/providers/nwc";

export {
  initializeSdk as initializeSparkSdk,
  createAndConnectWallet as createSparkWallet,
  connectWallet as connectSparkWallet,
  disconnectWallet as disconnectSparkWallet,
  isSparkInitialized,
  getSparkBalance,
  sendSparkPayment,
  createSparkInvoice,
  getSparkLightningAddress,
  getSparkState,
  subscribeToSparkState,
  checkLightningAddressAvailable,
  registerLightningAddress,
  deleteLightningAddress,
  refreshSparkLightningAddress,
} from "./wallet/spark";

export {
  backupSparkToNostr,
  restoreSparkFromNostr,
  hasSparkBackupOnNostr,
  deleteSparkBackupFromNostr,
  listSparkBackups,
  restoreSparkBackup,
} from "./wallet/spark/backup";
export type { SparkBackupEntry } from "./wallet/spark/backup";

export { loadMnemonic as loadSparkMnemonic } from "./wallet/spark/storage";

export {
  backupNwcToNostr,
  restoreNwcFromNostr,
  hasNwcBackupOnNostr,
  deleteNwcBackupFromNostr,
} from "./wallet/nwcBackup";

export {
  isBitcoinConnectEnabled,
  enableBitcoinConnect,
  disableBitcoinConnect,
  payWithBitcoinConnect,
  initBitcoinConnect,
  getBitcoinConnectState,
  subscribeToBitcoinConnectState,
  connectBitcoinConnect,
} from "./wallet/bitcoinConnect";

// React hooks
export { useNostr } from "./hooks/useNostr";
export type { UseNostrReturn, NostrConnectSession } from "./hooks/useNostr";

export { useWallet } from "./hooks/useWallet";
export type { UseWalletReturn } from "./hooks/useWallet";

// Settings
export {
  getDisableGameplayZaps,
  setDisableGameplayZaps,
  getShareToNostrDefault,
  setShareToNostrDefault,
  getShareMethodDefault,
  setShareMethodDefault,
  getSaveShareSettingDefault,
  setSaveShareSettingDefault,
  getZapNudgeDefaultAmount,
  setZapNudgeDefaultAmount,
  subscribeAppSettings,
} from "./settings/appSettings";
export type { ShareMethod } from "./settings/appSettings";

// Types
export type { NostrProfile, NostrClientOptions } from "./types/nostr";
export { DEFAULT_RELAYS, GAME_KIND, GAME_D_TAG_PREFIX, RACK_D_TAG_PREFIX } from "./types/nostr";

export type {
  WalletState,
  Wallet,
  ZapParams,
  SparkPayment,
  WalletProviderType,
  Transaction,
} from "./types/wallet";

export { WalletKind } from "./types/wallet";
