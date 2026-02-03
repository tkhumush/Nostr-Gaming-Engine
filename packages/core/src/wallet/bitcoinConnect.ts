/**
 * Bitcoin Connect External Wallet Module
 *
 * Manages Bitcoin Connect wallet connections as an external fallback option.
 * When enabled and no embedded wallet is active, payments use Bitcoin Connect modal.
 */

import type { BitcoinConnectInfo } from "../types/wallet";

const STORAGE_KEY = "wordswithzaps_bitcoin_connect_enabled";

// WebLN provider interface
interface WebLNProvider {
  enable(): Promise<void>;
  getInfo?(): Promise<{ node?: { alias?: string; pubkey?: string } }>;
  getBalance?(): Promise<{ balance: number; currency?: string }>;
  sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
}

// State
let _enabled = false;
let _provider: WebLNProvider | null = null;
let _walletInfo: BitcoinConnectInfo = { connected: false };
let _balance: number | null = null;
let _balanceLoading = false;

// State listeners
type StateListener = () => void;
const stateListeners: Set<StateListener> = new Set();

function notifyListeners() {
  stateListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

/**
 * Load enabled state from localStorage
 */
function loadEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

/**
 * Save enabled state to localStorage
 */
function saveEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

// Initialize from localStorage
if (typeof window !== "undefined") {
  _enabled = loadEnabled();
}

// --- Public State Accessors ---

export function getBitcoinConnectState() {
  return {
    enabled: _enabled,
    connected: _walletInfo.connected,
    walletInfo: _walletInfo,
    balance: _balance,
    balanceLoading: _balanceLoading,
  };
}

export function subscribeToBitcoinConnectState(
  listener: StateListener,
): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

// --- Provider Management ---

/**
 * Set the WebLN provider reference (called when connected via Bitcoin Connect modal)
 */
export function setBitcoinConnectProvider(
  provider: WebLNProvider | null,
): void {
  _provider = provider;

  if (provider) {
    _walletInfo = { ..._walletInfo, connected: true };
    notifyListeners();

    // Fetch info and balance when provider is set
    fetchBitcoinConnectInfo();
    fetchBitcoinConnectBalance();
  } else {
    _walletInfo = { connected: false };
    _balance = null;
    notifyListeners();
  }
}

/**
 * Get the current WebLN provider
 */
export function getBitcoinConnectProvider(): WebLNProvider | null {
  return _provider;
}

/**
 * Fetch wallet info from the connected Bitcoin Connect wallet
 */
export async function fetchBitcoinConnectInfo(): Promise<void> {
  if (!_provider) return;

  try {
    if (typeof _provider.getInfo === "function") {
      const info = await _provider.getInfo();
      _walletInfo = {
        alias: info.node?.alias,
        pubkey: info.node?.pubkey,
        connected: true,
      };
      notifyListeners();
    }
  } catch (e) {
    console.warn("[BitcoinConnect] Failed to fetch wallet info:", e);
  }
}

/**
 * Fetch balance from the connected Bitcoin Connect wallet
 */
export async function fetchBitcoinConnectBalance(): Promise<number | null> {
  if (!_provider) {
    _balance = null;
    notifyListeners();
    return null;
  }

  _balanceLoading = true;
  notifyListeners();

  try {
    if (typeof _provider.getBalance === "function") {
      const response = await _provider.getBalance();
      _balance = response.balance;
      notifyListeners();
      return _balance;
    }
    _balance = null;
    notifyListeners();
    return null;
  } catch (e) {
    console.warn("[BitcoinConnect] Failed to fetch balance:", e);
    _balance = null;
    notifyListeners();
    return null;
  } finally {
    _balanceLoading = false;
    notifyListeners();
  }
}

// --- Enable/Disable ---

/**
 * Enable Bitcoin Connect as external wallet option
 */
export function enableBitcoinConnect(): void {
  _enabled = true;
  saveEnabled(true);
  notifyListeners();
}

/**
 * Connect to Bitcoin Connect wallet (opens modal)
 */
export async function connectBitcoinConnect(): Promise<void> {
  try {
    const { init, requestProvider } = await import("@getalby/bitcoin-connect");

    // Initialize (safe to call multiple times)
    init({
      appName: "Words With Zaps",
    });

    // Enable if not already
    if (!_enabled) {
      _enabled = true;
      saveEnabled(true);
    }

    // Request provider - this opens the Bitcoin Connect modal
    const provider = await requestProvider();
    setBitcoinConnectProvider(provider);
  } catch (error) {
    console.error("[BitcoinConnect] Connection failed:", error);
    throw error;
  }
}

/**
 * Disable Bitcoin Connect and clear all state
 */
export async function disableBitcoinConnect(): Promise<void> {
  _enabled = false;
  saveEnabled(false);
  _provider = null;
  _walletInfo = { connected: false };
  _balance = null;
  notifyListeners();

  // Disconnect any active BC session
  try {
    const { disconnect } = await import("@getalby/bitcoin-connect");
    disconnect();
  } catch {
    // Ignore disconnect errors
  }
}

/**
 * Check if Bitcoin Connect is enabled
 */
export function isBitcoinConnectEnabled(): boolean {
  return _enabled;
}

/**
 * Check if Bitcoin Connect wallet is currently connected
 */
export function isBitcoinConnectConnected(): boolean {
  return _walletInfo.connected;
}

/**
 * Get current Bitcoin Connect balance
 */
export function getBitcoinConnectBalance(): number | null {
  return _balance;
}

/**
 * Pay an invoice using Bitcoin Connect
 * This triggers the Bitcoin Connect modal if not already connected
 */
export async function payWithBitcoinConnect(
  invoice: string,
): Promise<{ preimage: string }> {
  if (!_enabled) {
    throw new Error("Bitcoin Connect is not enabled");
  }

  try {
    // Dynamic import to avoid loading BC unless needed
    const { requestProvider } = await import("@getalby/bitcoin-connect");

    // Get or connect provider
    const provider = await requestProvider();
    setBitcoinConnectProvider(provider);

    // Pay the invoice
    const result = await provider.sendPayment(invoice);

    // Refresh balance after payment
    fetchBitcoinConnectBalance();

    return { preimage: result.preimage };
  } catch (error) {
    console.error("[BitcoinConnect] Payment failed:", error);
    throw error;
  }
}

/**
 * Initialize Bitcoin Connect with configuration
 * Call this early in app initialization
 */
export async function initBitcoinConnect(): Promise<void> {
  if (!_enabled) return;

  try {
    const { init, onConnected, onDisconnected } =
      await import("@getalby/bitcoin-connect");

    // Initialize with app name
    init({
      appName: "Words With Zaps",
    });

    // Set up connection listeners
    onConnected((provider) => {
      console.log("[BitcoinConnect] Wallet connected");
      setBitcoinConnectProvider(provider);
    });

    onDisconnected(() => {
      console.log("[BitcoinConnect] Wallet disconnected");
      setBitcoinConnectProvider(null);
    });
  } catch (error) {
    console.warn("[BitcoinConnect] Failed to initialize:", error);
  }
}

export default {
  getBitcoinConnectState,
  subscribeToBitcoinConnectState,
  setBitcoinConnectProvider,
  getBitcoinConnectProvider,
  fetchBitcoinConnectInfo,
  fetchBitcoinConnectBalance,
  enableBitcoinConnect,
  disableBitcoinConnect,
  isBitcoinConnectEnabled,
  isBitcoinConnectConnected,
  getBitcoinConnectBalance,
  payWithBitcoinConnect,
  initBitcoinConnect,
};
