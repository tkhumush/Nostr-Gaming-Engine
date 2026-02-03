/**
 * Wallet Store
 *
 * Manages multi-wallet state with localStorage persistence.
 * Supports NWC (kind 3) and Spark (kind 4) wallets.
 */

import { WalletKind, type Wallet } from '../types/wallet';

const STORAGE_KEY = 'wordswithzaps_wallets';
const CACHED_BALANCE_KEY = 'wordswithzaps_cached_balance';

// --- State ---
let _wallets: Wallet[] = [];
let _balance: number | null = null;
let _loading = false;
let _lastSync: number | null = null;

// State listeners
type StateListener = () => void;
const stateListeners: Set<StateListener> = new Set();

function notifyListeners() {
  stateListeners.forEach(listener => {
    try { listener(); } catch { /* ignore */ }
  });
}

// --- Storage Helpers ---

function loadWallets(): Wallet[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('[WalletStore] Failed to load wallets:', e);
  }
  return [];
}

function saveWallets(wallets: Wallet[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
  } catch (e) {
    console.error('[WalletStore] Failed to save wallets:', e);
  }
}

function getCachedBalance(walletId: string): number | null {
  try {
    const stored = localStorage.getItem(`${CACHED_BALANCE_KEY}_${walletId}`);
    if (stored) {
      return parseInt(stored, 10);
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function setCachedBalance(walletId: string, balance: number): void {
  try {
    localStorage.setItem(`${CACHED_BALANCE_KEY}_${walletId}`, String(balance));
  } catch {
    // Ignore storage errors
  }
}

// Initialize from localStorage
if (typeof window !== 'undefined') {
  _wallets = loadWallets();
  const active = _wallets.find(w => w.active);
  if (active) {
    _balance = getCachedBalance(active.id);
  }
}

// --- Public State Accessors ---

export function getWalletStoreState() {
  return {
    wallets: _wallets,
    activeWallet: _wallets.find(w => w.active) || null,
    balance: _balance,
    loading: _loading,
    connected: _wallets.some(w => w.active),
    lastSync: _lastSync
  };
}

export function subscribeToWalletStore(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

// --- Wallet Operations ---

/**
 * Add a new wallet
 */
export function addWallet(
  kind: WalletKind,
  name: string,
  data?: Wallet['data']
): Wallet {
  const newWallet: Wallet = {
    id: String(Date.now()),
    kind,
    name,
    active: _wallets.length === 0, // First wallet is active by default
    data
  };

  _wallets = [..._wallets, newWallet];
  saveWallets(_wallets);
  notifyListeners();

  return newWallet;
}

/**
 * Remove a wallet by ID
 */
export function removeWallet(id: string): void {
  const wasActive = _wallets.find(w => w.id === id)?.active;
  _wallets = _wallets.filter(w => w.id !== id);

  // If we removed the active wallet, make the first remaining one active
  if (wasActive && _wallets.length > 0 && !_wallets.some(w => w.active)) {
    _wallets[0].active = true;
  }

  saveWallets(_wallets);

  // Clear balance if we removed the active wallet
  if (wasActive) {
    _balance = null;
    _lastSync = null;
  }

  notifyListeners();
}

/**
 * Set the active wallet
 */
export function setActiveWallet(id: string): void {
  _wallets = _wallets.map(w => ({ ...w, active: w.id === id }));
  saveWallets(_wallets);

  // Load cached balance for new active wallet
  const active = _wallets.find(w => w.active);
  if (active) {
    _balance = getCachedBalance(active.id);
  } else {
    _balance = null;
  }
  _lastSync = null;

  notifyListeners();
}

/**
 * Update wallet name
 */
export function updateWalletName(id: string, name: string): void {
  _wallets = _wallets.map(w => w.id === id ? { ...w, name } : w);
  saveWallets(_wallets);
  notifyListeners();
}

/**
 * Update wallet data
 */
export function updateWalletData(id: string, data: Wallet['data']): void {
  _wallets = _wallets.map(w => w.id === id ? { ...w, data } : w);
  saveWallets(_wallets);
  notifyListeners();
}

/**
 * Set wallet balance
 */
export function setWalletBalance(balance: number | null): void {
  _balance = balance;

  // Cache balance for active wallet
  if (balance !== null) {
    const active = _wallets.find(w => w.active);
    if (active) {
      setCachedBalance(active.id, balance);
    }
  }

  notifyListeners();
}

/**
 * Set loading state
 */
export function setWalletLoading(loading: boolean): void {
  _loading = loading;
  notifyListeners();
}

/**
 * Set last sync timestamp
 */
export function setWalletLastSync(timestamp: number | null): void {
  _lastSync = timestamp;
  notifyListeners();
}

/**
 * Get wallet by kind
 */
export function getWalletByKind(kind: WalletKind): Wallet | undefined {
  return _wallets.find(w => w.kind === kind);
}

/**
 * Check if a specific wallet type is connected
 */
export function hasWalletKind(kind: WalletKind): boolean {
  return _wallets.some(w => w.kind === kind);
}

/**
 * Get the currently active wallet
 */
export function getActiveWallet(): Wallet | null {
  return _wallets.find(w => w.active) || null;
}

/**
 * Get all wallets
 */
export function getWallets(): Wallet[] {
  return _wallets;
}

/**
 * Clear all wallets
 */
export function clearAllWallets(): void {
  _wallets = [];
  _balance = null;
  _lastSync = null;
  saveWallets(_wallets);
  notifyListeners();
}

/**
 * Get wallet kind display name
 */
export function getWalletKindName(kind: WalletKind): string {
  switch (kind) {
    case WalletKind.NWC:
      return 'NWC';
    case WalletKind.SPARK:
      return 'Self-custodial';
    default:
      return 'Unknown';
  }
}

export default {
  getWalletStoreState,
  subscribeToWalletStore,
  addWallet,
  removeWallet,
  setActiveWallet,
  updateWalletName,
  updateWalletData,
  setWalletBalance,
  setWalletLoading,
  setWalletLastSync,
  getWalletByKind,
  hasWalletKind,
  getActiveWallet,
  getWallets,
  clearAllWallets,
  getWalletKindName
};
