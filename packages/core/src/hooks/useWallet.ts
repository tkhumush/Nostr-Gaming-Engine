import React, { useState, useEffect, useCallback, useRef } from "react";
import type { WalletState, ZapParams, Wallet } from "../types/wallet";
import { WalletKind } from "../types/wallet";
import {
  initializeWalletManager,
  connectWallet,
  disconnectWallet,
  refreshBalance,
  zapUser as walletZapUser,
  isWalletReady,
  getWalletStoreState,
  subscribeToWalletStore,
  isValidNwcUrl,
  hasSparkMnemonic,
} from "../wallet/walletManager";
import {
  disableBitcoinConnect,
  connectBitcoinConnect,
  getBitcoinConnectState,
  subscribeToBitcoinConnectState,
} from "../wallet/bitcoinConnect";
import {
  createAndConnectWallet as createSparkWallet,
  importAndConnectWallet as importSparkWallet,
  subscribeToSparkState,
} from "../wallet/spark";
import { getCurrentUser } from "../nostr/client";

export interface UseWalletReturn {
  // State
  state: WalletState;
  wallets: Wallet[];
  activeWallet: Wallet | null;

  // NWC
  connectNWC: (connectionUri: string) => Promise<void>;

  // Spark
  createSparkWallet: () => Promise<string>; // returns mnemonic
  importSparkWallet: (mnemonic: string) => Promise<void>;
  hasSparkWallet: boolean;

  // Bitcoin Connect
  bitcoinConnectEnabled: boolean;
  bitcoinConnectConnected: boolean;
  connectBitcoinConnect: () => Promise<void>;
  disconnectBitcoinConnect: () => Promise<void>;

  // General
  disconnect: (walletId?: string) => Promise<void>;
  setActiveWallet: (walletId: string) => Promise<void>;
  zapUser: (params: ZapParams) => Promise<string>;
  refreshBalance: (forceSync?: boolean) => Promise<void>;
  isReady: boolean;
}

function mapToWalletState(
  storeState: ReturnType<typeof getWalletStoreState>,
): WalletState {
  return {
    connected: storeState.connected,
    providerType: storeState.activeWallet
      ? storeState.activeWallet.kind === WalletKind.SPARK
        ? "spark"
        : "nwc"
      : "none",
    balance: storeState.balance ?? undefined,
    loading: storeState.loading,
    activeWallet: storeState.activeWallet,
    wallets: storeState.wallets,
  };
}

export function useWallet(): UseWalletReturn {
  const [walletStoreState, setWalletStoreState] = useState(() =>
    getWalletStoreState(),
  );
  const [bcState, setBcState] = useState(() => getBitcoinConnectState());
  const initialized = useRef(false);

  // Initialize wallet manager on mount
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initializeWalletManager().catch(console.error);
    }
  }, []);

  // Subscribe to wallet store changes
  useEffect(() => {
    const unsubscribe = subscribeToWalletStore(() => {
      setWalletStoreState(getWalletStoreState());
    });
    return unsubscribe;
  }, []);

  // Subscribe to Spark state changes (updates wallet store state when Spark changes)
  useEffect(() => {
    const unsubscribe = subscribeToSparkState(() => {
      // Spark state change may affect wallet store state
      setWalletStoreState(getWalletStoreState());
    });
    return unsubscribe;
  }, []);

  // Subscribe to Bitcoin Connect state changes
  useEffect(() => {
    const unsubscribe = subscribeToBitcoinConnectState(() => {
      setBcState(getBitcoinConnectState());
    });
    return unsubscribe;
  }, []);

  const handleConnectNWC = useCallback(async (connectionUri: string) => {
    if (!isValidNwcUrl(connectionUri)) {
      throw new Error("Invalid NWC connection URI");
    }
    const result = await connectWallet(WalletKind.NWC, connectionUri);
    if (!result.success) {
      throw new Error(result.error || "Failed to connect NWC wallet");
    }
  }, []);

  const handleCreateSparkWallet = useCallback(async (): Promise<string> => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      throw new Error("Must be logged in to create Spark wallet");
    }
    const apiKey = import.meta.env?.VITE_BREEZ_SPARK_API_KEY || "";
    if (!apiKey) {
      throw new Error("Breez API key not configured");
    }
    const mnemonic = await createSparkWallet(currentUser.pubkey, apiKey);

    // Add to wallet store
    const result = await connectWallet(WalletKind.SPARK);
    if (!result.success) {
      throw new Error(result.error || "Failed to register Spark wallet");
    }

    return mnemonic;
  }, []);

  const handleImportSparkWallet = useCallback(async (mnemonic: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      throw new Error("Must be logged in to import Spark wallet");
    }
    const apiKey = import.meta.env?.VITE_BREEZ_SPARK_API_KEY || "";
    if (!apiKey) {
      throw new Error("Breez API key not configured");
    }
    await importSparkWallet(currentUser.pubkey, mnemonic, apiKey);

    // Add to wallet store
    const result = await connectWallet(WalletKind.SPARK);
    if (!result.success) {
      throw new Error(result.error || "Failed to register Spark wallet");
    }
  }, []);

  const handleConnectBitcoinConnect = useCallback(async () => {
    await connectBitcoinConnect();
  }, []);

  const handleDisconnectBitcoinConnect = useCallback(async () => {
    await disableBitcoinConnect();
  }, []);

  const handleDisconnect = useCallback(async (walletId?: string) => {
    await disconnectWallet(walletId);
  }, []);

  const handleSetActiveWallet = useCallback(async (walletId: string) => {
    const { setActiveWallet: setActive } =
      await import("../wallet/walletStore");
    setActive(walletId);
  }, []);

  const handleZapUser = useCallback(
    async (params: ZapParams): Promise<string> => {
      return walletZapUser(params);
    },
    [],
  );

  const handleRefreshBalance = useCallback(async (forceSync = false) => {
    await refreshBalance(forceSync);
  }, []);

  // Check if user has a Spark wallet mnemonic stored
  // Re-check whenever wallet store state changes (e.g., after disconnect)
  const currentUser = getCurrentUser();
  const hasSparkWallet = React.useMemo(() => {
    // This dependency on walletStoreState ensures re-check after wallet changes
    void walletStoreState;
    return currentUser?.pubkey ? hasSparkMnemonic(currentUser.pubkey) : false;
  }, [currentUser?.pubkey, walletStoreState]);

  return {
    state: mapToWalletState(walletStoreState),
    wallets: walletStoreState.wallets,
    activeWallet: walletStoreState.activeWallet,

    connectNWC: handleConnectNWC,

    createSparkWallet: handleCreateSparkWallet,
    importSparkWallet: handleImportSparkWallet,
    hasSparkWallet,

    bitcoinConnectEnabled: bcState.enabled,
    bitcoinConnectConnected: bcState.connected,
    connectBitcoinConnect: handleConnectBitcoinConnect,
    disconnectBitcoinConnect: handleDisconnectBitcoinConnect,

    disconnect: handleDisconnect,
    setActiveWallet: handleSetActiveWallet,
    zapUser: handleZapUser,
    refreshBalance: handleRefreshBalance,
    isReady: isWalletReady(),
  };
}

export default useWallet;
