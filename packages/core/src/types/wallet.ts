// Wallet kind enum for multi-wallet support
export enum WalletKind {
  NWC = 3, // Nostr Wallet Connect
  SPARK = 4, // Breez SDK Spark
}

export type WalletProviderType = "spark" | "nwc" | "bitcoin-connect" | "none";

// Wallet instance stored in wallet store
export interface Wallet {
  id: string;
  kind: WalletKind;
  name: string;
  active: boolean;
  data?: {
    // NWC: connection string
    connectionUrl?: string;
    // Spark: has local mnemonic
    hasMnemonic?: boolean;
  };
}

// NWC transaction from list_transactions
export interface NwcTransaction {
  type: "incoming" | "outgoing";
  invoice?: string;
  description?: string;
  description_hash?: string;
  preimage?: string;
  payment_hash: string;
  amount: number; // millisats
  fees_paid?: number;
  created_at: number;
  expires_at?: number;
  settled_at?: number;
  metadata?: Record<string, unknown>;
}

// Spark payment from SDK
export interface SparkPayment {
  id: string;
  type: "incoming" | "outgoing";
  amountSats: number;
  feesSats?: number;
  description?: string;
  preimage?: string;
  paymentHash?: string;
  createdAt: number;
  settledAt?: number;
  status: "pending" | "succeeded" | "failed";
}

export interface ZapParams {
  recipientPubkey: string;
  amountSats: number;
  gameId: string;
  moveDescription: string; // e.g. "Played QUIZ for 22 points"
}

export interface WalletProvider {
  type: WalletProviderType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getBalance(): Promise<number>;
  zapUser(params: ZapParams): Promise<string>; // returns preimage
}

export interface WalletState {
  connected: boolean;
  providerType: WalletProviderType;
  balance?: number;
  error?: string;
  loading?: boolean;
  activeWallet?: Wallet | null;
  wallets?: Wallet[];
}

export interface LnurlPayResponse {
  callback: string;
  maxSendable: number;
  minSendable: number;
  metadata: string;
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

// NIP-47 NWC request/response types
export interface Nip47Request {
  method: string;
  params: Record<string, unknown>;
}

export interface Nip47Response {
  result_type: string;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
}

// BitcoinConnect wallet info
export interface BitcoinConnectInfo {
  alias?: string;
  pubkey?: string;
  connected: boolean;
  balance?: number;
}

// Unified transaction type for display
export interface Transaction {
  id: string;
  type: "incoming" | "outgoing";
  amountSats: number;
  feesSats?: number;
  description?: string;
  timestamp: number; // Unix timestamp (seconds)
  status: "pending" | "succeeded" | "failed";
}
