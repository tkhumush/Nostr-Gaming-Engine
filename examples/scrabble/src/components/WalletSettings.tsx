import { useState, useEffect, useCallback } from "react";
import {
  useWallet,
  backupNwcToNostr,
  restoreNwcFromNostr,
  hasNwcBackupOnNostr,
  deleteNwcBackupFromNostr,
  backupSparkToNostr,
  deleteSparkBackupFromNostr,
  getSparkLightningAddress,
  getCurrentUser,
  fetchProfile,
  WalletKind,
  getNwcLud16,
  getNwcConnectionUrl,
  getTransactionHistory,
  sendPayment,
  createInvoice,
  updateProfileLightningAddress,
  loadSparkMnemonic,
  listSparkBackups,
  restoreSparkBackup,
  checkLightningAddressAvailable,
  registerLightningAddress,
  deleteLightningAddress,
  refreshSparkLightningAddress,
  type Transaction,
  type SparkBackupEntry,
} from "@nostr-gaming-engine/core";
import { SparkLogo, NwcLogo, BitcoinConnectLogo } from "./icons/WalletIcons";
import { QRCodeSVG } from "qrcode.react";
import "./WalletSettings.css";

interface WalletSettingsProps {
  onClose: () => void;
  onToast?: (message: string, tone?: "success" | "error" | "info") => void;
}

type ViewState =
  | "main"
  | "add-nwc"
  | "spark-options"
  | "spark-restore-phrase"
  | "backup"
  | "transactions"
  | "lightning-address"
  | "funds";

interface WalletOptionCardProps {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}

function WalletOptionCard({
  icon,
  iconClass,
  title,
  subtitle,
  onClick,
  disabled,
}: WalletOptionCardProps) {
  return (
    <button
      className="wallet-option"
      onClick={onClick}
      disabled={disabled}
      type="button"
    >
      <div className={`wallet-option-icon ${iconClass}`}>{icon}</div>
      <div className="wallet-option-text">
        <span className="wallet-option-title">{title}</span>
        <span className="wallet-option-subtitle">{subtitle}</span>
      </div>
    </button>
  );
}

const MNEMONIC_DELAY_SECONDS = 5;

function MnemonicBackupScreen({
  mnemonic,
  onConfirmed,
}: {
  mnemonic: string;
  onConfirmed: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MNEMONIC_DELAY_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const canConfirm = secondsLeft === 0;
  const canProceed = confirmed && canConfirm;

  return (
    <div className="wallet-settings-overlay">
      <div className="wallet-settings-modal">
        <h2>Save Your Recovery Phrase</h2>
        <div className="mnemonic-display">
          {mnemonic.split(" ").map((word, i) => (
            <div key={i} className="mnemonic-word">
              <span className="mnemonic-num">{i + 1}.</span> {word}
            </div>
          ))}
        </div>
        <div className="mnemonic-warnings">
          <p>Write these 12 words on paper and store safely.</p>
          <p>Do not screenshot or share with anyone.</p>
        </div>
        <label
          className={`wallet-checkbox-label ${!canConfirm ? "disabled" : ""}`}
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={!canConfirm}
          />
          <span>I have saved my recovery phrase</span>
        </label>
        <button
          className="wallet-btn primary"
          onClick={onConfirmed}
          disabled={!canProceed}
          style={{ marginTop: "16px" }}
        >
          {!canConfirm
            ? `Please read carefully (${secondsLeft}s)`
            : "Create My Wallet"}
        </button>
      </div>
    </div>
  );
}

type FundsSubView = "main" | "receive" | "send";

const RECEIVE_PRESET_AMOUNTS = [1000, 5000, 10000, 21000];

interface FundsViewProps {
  balance?: number;
  lightningAddress?: string | null;
  onBack: () => void;
  onBalanceChange?: () => void;
  onToast?: (message: string, tone?: "success" | "error" | "info") => void;
}

function FundsView({
  balance,
  lightningAddress,
  onBack,
  onBalanceChange,
  onToast,
}: FundsViewProps) {
  const [subView, setSubView] = useState<FundsSubView>("main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Receive state
  const [receiveAmount, setReceiveAmount] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<
    number | "custom" | null
  >(null);
  const [receiveDescription, setReceiveDescription] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  // Send state
  const [sendInput, setSendInput] = useState("");
  const [sendAmount, setSendAmount] = useState("");

  // Detect if input looks like a lightning address (not an invoice)
  const isLightningAddress =
    sendInput.trim() &&
    !sendInput.trim().toLowerCase().startsWith("lnbc") &&
    sendInput.includes("@");

  const handleCreateInvoice = async () => {
    const amount = parseInt(receiveAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await createInvoice(
        amount,
        receiveDescription || undefined,
      );
      setInvoice(result.invoice);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create invoice";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInvoice = async () => {
    if (!invoice) return;

    try {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  const handleSendPayment = async () => {
    if (!sendInput.trim()) {
      setError("Please enter an invoice or lightning address");
      return;
    }

    // For lightning addresses, require an amount
    if (isLightningAddress) {
      const amount = parseInt(sendAmount, 10);
      if (isNaN(amount) || amount <= 0) {
        setError("Please enter an amount to send");
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const metadata = isLightningAddress
        ? { amount: parseInt(sendAmount, 10) }
        : undefined;
      const result = await sendPayment(sendInput.trim(), metadata);
      if (result.success) {
        onToast?.("Payment sent!", "success");
        onBalanceChange?.();
        onBack();
      } else {
        setError(result.error || "Payment failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubBack = () => {
    setSubView("main");
    setError(null);
    setInvoice(null);
    setReceiveAmount("");
    setSelectedPreset(null);
    setReceiveDescription("");
    setSendInput("");
    setSendAmount("");
  };

  const handleCopyAddress = async () => {
    if (!lightningAddress) return;
    try {
      await navigator.clipboard.writeText(lightningAddress);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  const handleSelectPreset = (amount: number) => {
    setSelectedPreset(amount);
    setReceiveAmount(String(amount));
  };

  const handleCustomAmount = () => {
    setSelectedPreset("custom");
    setReceiveAmount("");
  };

  return (
    <>
      {subView === "main" && (
        <>
          <h2>Manage Funds</h2>
          {error && <div className="wallet-error">{error}</div>}

          <div className="funds-balance-display">
            <span className="funds-balance-label">Balance</span>
            <span className="funds-balance-amount">
              <img
                src="/assets/bolt-yellow.svg"
                alt=""
                className="balance-bolt"
              />
              {balance !== undefined ? balance.toLocaleString() : "—"}
              <span className="funds-balance-unit">sats</span>
            </span>
          </div>

          <div className="funds-action-buttons">
            <button
              className="funds-action-btn receive"
              onClick={() => setSubView("receive")}
            >
              <span className="funds-action-icon">↓</span>
              Receive
            </button>
            <button
              className="funds-action-btn send"
              onClick={() => setSubView("send")}
            >
              <span className="funds-action-icon">↑</span>
              Send
            </button>
          </div>
        </>
      )}

      {subView === "receive" && (
        <>
          <h2>Receive Sats</h2>
          {error && <div className="wallet-error">{error}</div>}

          {!invoice ? (
            <>
              {/* Lightning Address section */}
              {lightningAddress && (
                <div className="receive-section">
                  <div className="receive-section-header">
                    <span className="receive-section-title">
                      Lightning Address
                    </span>
                    <span className="receive-section-hint">For any amount</span>
                  </div>
                  <div className="receive-qr-container">
                    <QRCodeSVG
                      value={`lightning:${lightningAddress}`}
                      size={160}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#000000"
                      imageSettings={{
                        src: "/favicon.svg",
                        height: 32,
                        width: 32,
                        excavate: true,
                      }}
                    />
                  </div>
                  <div className="receive-address-display">
                    <code className="receive-address-text">
                      {lightningAddress}
                    </code>
                    <button
                      className="wallet-btn-small"
                      onClick={handleCopyAddress}
                    >
                      {addressCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              )}

              {/* Invoice section */}
              <div className="receive-section">
                <div className="receive-section-header">
                  <span className="receive-section-title">
                    {lightningAddress ? "Or create invoice" : "Create Invoice"}
                  </span>
                  <span className="receive-section-hint">
                    For specific amount
                  </span>
                </div>

                {/* Preset amounts */}
                <div className="receive-presets">
                  {RECEIVE_PRESET_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      className={`receive-preset-btn ${selectedPreset === amount ? "active" : ""}`}
                      onClick={() => handleSelectPreset(amount)}
                      disabled={loading}
                    >
                      {amount.toLocaleString()}
                    </button>
                  ))}
                  <button
                    className={`receive-preset-btn ${selectedPreset === "custom" ? "active" : ""}`}
                    onClick={handleCustomAmount}
                    disabled={loading}
                  >
                    Custom
                  </button>
                </div>

                {/* Custom amount input */}
                {selectedPreset === "custom" && (
                  <div className="receive-custom-input">
                    <input
                      type="number"
                      className="wallet-input"
                      placeholder="Enter amount in sats"
                      value={receiveAmount}
                      onChange={(e) =>
                        setReceiveAmount(e.target.value.slice(0, 8))
                      }
                      disabled={loading}
                      min="1"
                      maxLength={8}
                      autoFocus
                    />
                  </div>
                )}

                <button
                  className="wallet-btn primary receive-create-btn"
                  onClick={handleCreateInvoice}
                  disabled={loading || !receiveAmount}
                >
                  {loading ? "Creating..." : "Create Invoice"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="receive-qr-container">
                <QRCodeSVG
                  value={invoice}
                  size={180}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                  imageSettings={{
                    src: "/favicon.svg",
                    height: 36,
                    width: 36,
                    excavate: true,
                  }}
                />
              </div>

              <div className="receive-invoice-container">
                <div className="receive-invoice-row">
                  <code className="receive-invoice-text">
                    {invoice.substring(0, 20)}...
                    {invoice.substring(invoice.length - 12)}
                  </code>
                  <button
                    className="wallet-btn-small"
                    onClick={handleCopyInvoice}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>

                <p className="receive-invoice-hint">
                  Scan QR code or copy invoice to receive{" "}
                  {parseInt(receiveAmount, 10).toLocaleString()} sats
                </p>
              </div>
            </>
          )}
        </>
      )}

      {subView === "send" && (
        <>
          <h2>Send Sats</h2>
          {error && <div className="wallet-error">{error}</div>}

          <div className="wallet-section">
            <label className="wallet-input-label">
              Invoice or Lightning Address
            </label>
            <textarea
              className="wallet-input"
              placeholder="lnbc... or user@wallet.com"
              value={sendInput}
              onChange={(e) => setSendInput(e.target.value)}
              disabled={loading}
              rows={3}
            />
          </div>

          {/* Show amount input for lightning addresses */}
          {isLightningAddress && (
            <div className="wallet-section">
              <label className="wallet-input-label">Amount (sats)</label>
              <input
                type="number"
                className="wallet-input"
                placeholder="Enter amount"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value.slice(0, 8))}
                disabled={loading}
                min="1"
                maxLength={8}
              />
            </div>
          )}

          {!isLightningAddress && (
            <p className="wallet-hint">
              Paste a Lightning invoice (lnbc...) or enter a Lightning address
              (user@domain.com)
            </p>
          )}

          <div className="wallet-actions">
            <button
              className="wallet-btn secondary"
              onClick={handleSubBack}
              disabled={loading}
            >
              Back
            </button>
            <button
              className="wallet-btn primary"
              onClick={handleSendPayment}
              disabled={
                loading ||
                !sendInput.trim() ||
                (isLightningAddress ? !sendAmount.trim() : false)
              }
            >
              {loading ? "Sending..." : "Send Payment"}
            </button>
          </div>
        </>
      )}
    </>
  );
}

export function WalletSettings({ onClose, onToast }: WalletSettingsProps) {
  const {
    wallets,
    activeWallet,
    connectNWC,
    createSparkWallet,
    importSparkWallet,
    hasSparkWallet,
    bitcoinConnectConnected,
    connectBitcoinConnect,
    disconnectBitcoinConnect,
    disconnect,
    setActiveWallet,
    refreshBalance,
    state,
  } = useWallet();

  const [view, setView] = useState<ViewState>("main");
  const [nwcUrl, setNwcUrl] = useState("");
  const [sparkMnemonic, setSparkMnemonic] = useState("");
  const [newMnemonic, setNewMnemonic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [checkingBackup, setCheckingBackup] = useState(false);
  const [sparkBackups, setSparkBackups] = useState<SparkBackupEntry[]>([]);

  // NWC backup state
  const [checkingNwcBackup, setCheckingNwcBackup] = useState(false);
  const [hasNwcBackup, setHasNwcBackup] = useState(false);

  // Transaction history state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const TRANSACTIONS_PER_PAGE = 30;

  // Wallet removal confirmation state
  const [walletToRemove, setWalletToRemove] = useState<{
    id: string;
    name: string;
    kind: WalletKind;
  } | null>(null);
  const [clearFromBrowser, setClearFromBrowser] = useState(true);

  // Backup deletion confirmation state
  const [backupToDelete, setBackupToDelete] = useState<"spark" | "nwc" | null>(
    null,
  );

  // View credentials state
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [viewMnemonic, setViewMnemonic] = useState<string | null>(null);
  const [showNwcString, setShowNwcString] = useState(false);
  const [copiedNwc, setCopiedNwc] = useState(false);

  // Lightning address state
  const [sparkLnAddress, setSparkLnAddress] = useState<string | null>(null);
  const [sparkLnAddressLoading, setSparkLnAddressLoading] = useState(false);
  const [nwcLnAddress, setNwcLnAddress] = useState<string | null>(null);
  const [profileLnAddress, setProfileLnAddress] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null,
  );
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [lnAddressToDelete, setLnAddressToDelete] = useState(false);

  // Load transactions when entering transactions view
  const loadTransactions = useCallback(
    async (reset = false) => {
      if (loadingTransactions) return;
      setLoadingTransactions(true);
      try {
        const offset = reset ? 0 : transactions.length;
        const result = await getTransactionHistory({
          limit: TRANSACTIONS_PER_PAGE,
          offset,
        });
        if (reset) {
          setTransactions(result.transactions);
        } else {
          setTransactions((prev) => [...prev, ...result.transactions]);
        }
        setHasMoreTransactions(result.hasMore);
      } catch (e) {
        console.error("Failed to load transactions:", e);
      } finally {
        setLoadingTransactions(false);
      }
    },
    [loadingTransactions, transactions.length],
  );

  useEffect(() => {
    if (view === "transactions") {
      loadTransactions(true);
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check for Nostr backups when entering spark-options view
  useEffect(() => {
    if (view === "spark-options") {
      const currentUser = getCurrentUser();
      if (currentUser?.pubkey) {
        setCheckingBackup(true);
        setSparkBackups([]);
        listSparkBackups(currentUser.pubkey)
          .then((backups) => setSparkBackups(backups))
          .catch(() => setSparkBackups([]))
          .finally(() => setCheckingBackup(false));
      } else {
        setSparkBackups([]);
        setCheckingBackup(false);
      }
    }
  }, [view]);

  // Check for NWC backup when entering add-nwc view
  useEffect(() => {
    if (view === "add-nwc") {
      const currentUser = getCurrentUser();
      if (currentUser?.pubkey) {
        setCheckingNwcBackup(true);
        setHasNwcBackup(false);
        hasNwcBackupOnNostr(currentUser.pubkey)
          .then((hasBackup) => setHasNwcBackup(hasBackup))
          .catch(() => setHasNwcBackup(false))
          .finally(() => setCheckingNwcBackup(false));
      } else {
        setHasNwcBackup(false);
        setCheckingNwcBackup(false);
      }
    }
  }, [view]);

  // Load lightning addresses when entering lightning-address or funds view
  useEffect(() => {
    if (view === "lightning-address" || view === "funds") {
      // Get Spark lightning address - first check cached, then refresh from SDK
      const cachedSparkAddr = getSparkLightningAddress();
      setSparkLnAddress(cachedSparkAddr);

      if (hasSparkWallet) {
        // If no cached address, show loading while we fetch from SDK
        if (!cachedSparkAddr && view === "lightning-address") {
          setSparkLnAddressLoading(true);
        }
        refreshSparkLightningAddress()
          .then((addr) => {
            setSparkLnAddress(addr);
          })
          .catch(() => {
            // Keep cached value if refresh fails
          })
          .finally(() => {
            setSparkLnAddressLoading(false);
          });
      }

      // Get NWC lightning address from connection URL
      const nwcConnectionUrl = getNwcConnectionUrl();
      const nwcAddr = nwcConnectionUrl ? getNwcLud16(nwcConnectionUrl) : null;
      setNwcLnAddress(nwcAddr);

      // Only load profile and reset form for lightning-address view
      if (view === "lightning-address") {
        // Get profile lightning address
        const currentUser = getCurrentUser();
        if (currentUser?.pubkey) {
          fetchProfile(currentUser.pubkey)
            .then((profile) => {
              setProfileLnAddress(profile?.lud16 || null);
            })
            .catch(() => setProfileLnAddress(null));
        }

        // Reset form state
        setNewUsername("");
        setUsernameAvailable(null);
        setLnAddressToDelete(false);
      }
    }
  }, [view, hasSparkWallet]);

  // Debounced username availability check
  useEffect(() => {
    if (!newUsername.trim() || view !== "lightning-address") {
      setUsernameAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const available = await checkLightningAddressAvailable(
          newUsername.trim(),
        );
        setUsernameAvailable(available);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [newUsername, view]);

  const hasEmbeddedWallet = wallets.some(
    (wallet) =>
      wallet.kind === WalletKind.SPARK || wallet.kind === WalletKind.NWC,
  );
  const hasNwcWallet = wallets.some((wallet) => wallet.kind === WalletKind.NWC);

  const handleConnectNWC = async () => {
    try {
      setLoading(true);
      setError(null);
      await connectNWC(nwcUrl.trim());
      setNwcUrl("");
      setView("main");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect NWC");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSpark = async () => {
    try {
      setLoading(true);
      setError(null);
      const mnemonic = await createSparkWallet();
      setNewMnemonic(mnemonic);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create wallet");
    } finally {
      setLoading(false);
    }
  };

  const handleImportSpark = async () => {
    try {
      setLoading(true);
      setError(null);
      await importSparkWallet(sparkMnemonic.trim());
      setSparkMnemonic("");
      setView("main");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import wallet");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupNwc = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setError("Must be logged in to backup");
      return;
    }

    const nwcWallet = wallets.find((w) => w.kind === WalletKind.NWC);
    if (!nwcWallet?.data?.connectionUrl) {
      setError("No NWC wallet to backup");
      return;
    }

    try {
      setLoading(true);
      await backupNwcToNostr(currentUser.pubkey, nwcWallet.data.connectionUrl);
      setBackupStatus("NWC backup saved to Nostr");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreNwc = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setError("Must be logged in to restore");
      return;
    }

    try {
      setLoading(true);
      const connectionUrl = await restoreNwcFromNostr(currentUser.pubkey);
      if (connectionUrl) {
        await connectNWC(connectionUrl);
        setBackupStatus("NWC wallet restored from Nostr");
        setView("main");
      } else {
        setError("No NWC backup found on Nostr");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupSpark = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setError("Must be logged in to backup");
      return;
    }

    try {
      setLoading(true);
      await backupSparkToNostr(currentUser.pubkey);
      setBackupStatus("Spark backup saved to Nostr");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeleteBackup = async () => {
    if (!backupToDelete) return;

    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setError("Must be logged in to delete backup");
      setBackupToDelete(null);
      return;
    }

    try {
      setLoading(true);
      if (backupToDelete === "spark") {
        await deleteSparkBackupFromNostr(currentUser.pubkey);
        setBackupStatus("Spark backup deleted from Nostr");
      } else {
        await deleteNwcBackupFromNostr(currentUser.pubkey);
        setBackupStatus("NWC backup deleted from Nostr");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setLoading(false);
      setBackupToDelete(null);
    }
  };

  const handleRestoreSparkBackup = async (backup: SparkBackupEntry) => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) {
      setError("Must be logged in to restore");
      return;
    }

    try {
      setLoading(true);
      const mnemonic = await restoreSparkBackup(currentUser.pubkey, backup);
      await importSparkWallet(mnemonic);
      // Force sync and refresh balance after restore
      await refreshBalance(true);
      setBackupStatus("Spark wallet restored from Nostr");
      setView("main");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRemoveWallet = async () => {
    if (!walletToRemove) return;

    try {
      setLoading(true);

      // Handle external wallets
      if (walletToRemove.id === "bitcoin-connect") {
        await disconnectBitcoinConnect();
      } else if (clearFromBrowser) {
        // Full disconnect - removes from browser storage
        await disconnect(walletToRemove.id);
      } else {
        // Just disconnect session but keep mnemonic in browser
        await disconnect(walletToRemove.id);
      }

      setWalletToRemove(null);
      setClearFromBrowser(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove wallet");
    } finally {
      setLoading(false);
    }
  };

  const handleMnemonicConfirmed = () => {
    setNewMnemonic(null);
    setView("main");
  };

  // View credentials handlers
  const handleViewMnemonic = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser?.pubkey) return;

    try {
      const mnemonic = await loadSparkMnemonic(currentUser.pubkey);
      if (mnemonic) {
        setViewMnemonic(mnemonic);
        setShowMnemonic(true);
      } else {
        setError("Could not load recovery phrase");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load recovery phrase",
      );
    }
  };

  const handleCopyNwcString = async () => {
    const connectionUrl = getNwcConnectionUrl();
    if (!connectionUrl) return;

    try {
      await navigator.clipboard.writeText(connectionUrl);
      setCopiedNwc(true);
      setTimeout(() => setCopiedNwc(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  // Lightning address handlers
  const handleRegisterLightningAddress = async () => {
    if (!newUsername.trim() || !usernameAvailable) return;

    try {
      setLoading(true);
      setError(null);
      const address = await registerLightningAddress(newUsername.trim());
      setSparkLnAddress(address);
      setNewUsername("");
      setUsernameAvailable(null);
      setBackupStatus(`Lightning address ${address} registered!`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to register lightning address",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLightningAddress = async () => {
    try {
      setLoading(true);
      setError(null);
      await deleteLightningAddress();
      setSparkLnAddress(null);
      setLnAddressToDelete(false);
      setBackupStatus("Lightning address deleted");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to delete lightning address",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfileLightningAddress = async (newAddress: string) => {
    try {
      setLoading(true);
      setError(null);
      await updateProfileLightningAddress(newAddress);
      setProfileLnAddress(newAddress);
      setBackupStatus("Profile lightning address updated!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  // Get the active wallet's lightning address
  const getActiveWalletLightningAddress = (): string | null => {
    if (!activeWallet) return null;
    if (activeWallet.kind === WalletKind.SPARK) return sparkLnAddress;
    if (activeWallet.kind === WalletKind.NWC) return nwcLnAddress;
    return null;
  };

  // Show mnemonic backup screen after creating new wallet
  if (newMnemonic) {
    return (
      <MnemonicBackupScreen
        mnemonic={newMnemonic}
        onConfirmed={handleMnemonicConfirmed}
      />
    );
  }

  // Wallet removal confirmation modal
  if (walletToRemove) {
    const isExternalWallet = walletToRemove.id === "bitcoin-connect";

    return (
      <div className="wallet-settings-overlay">
        <div className="wallet-settings-modal">
          <h2>Disconnect Wallet</h2>
          <p className="wallet-hint" style={{ marginBottom: "16px" }}>
            Are you sure you want to disconnect{" "}
            <strong>{walletToRemove.name}</strong>?
          </p>

          {!isExternalWallet && walletToRemove.kind === WalletKind.SPARK && (
            <label className="wallet-checkbox-label">
              <input
                type="checkbox"
                checked={clearFromBrowser}
                onChange={(e) => setClearFromBrowser(e.target.checked)}
              />
              <span>Also clear wallet from this browser</span>
            </label>
          )}

          <p
            className="wallet-hint"
            style={{ marginTop: "12px", fontSize: "11px" }}
          >
            {isExternalWallet
              ? "You can reconnect anytime."
              : walletToRemove.kind === WalletKind.SPARK
                ? clearFromBrowser
                  ? "Your wallet backup on Nostr relays will remain. You can restore it later."
                  : "Wallet will stay in browser storage for quick reconnection."
                : "Your NWC connection will be removed."}
          </p>

          <div className="wallet-actions" style={{ marginTop: "20px" }}>
            <button
              className="wallet-btn secondary"
              onClick={() => {
                setWalletToRemove(null);
                setClearFromBrowser(true);
              }}
            >
              Cancel
            </button>
            <button
              className="wallet-btn danger"
              onClick={handleConfirmRemoveWallet}
              disabled={loading}
            >
              {loading ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-settings-overlay">
      <div className="wallet-settings-modal">
        <button
          className="wallet-settings-close"
          onClick={() => {
            if (view === "main") {
              onClose();
            } else {
              setView("main");
              setError(null);
              setBackupStatus(null);
              setTransactions([]);
            }
          }}
        >
          &times;
        </button>

        {view === "main" && (
          <>
            <h2>Wallet Settings</h2>

            {error && <div className="wallet-error">{error}</div>}
            {backupStatus && (
              <div className="wallet-success">{backupStatus}</div>
            )}

            {/* Balance - at top */}
            {activeWallet && state.balance !== undefined && (
              <>
                <div className="wallet-balance">
                  <span className="balance-label">Balance</span>
                  <span className="balance-amount">
                    <img
                      src="/assets/bolt-yellow.svg"
                      alt=""
                      className="balance-bolt"
                    />
                    {state.balance.toLocaleString()}
                  </span>
                </div>
                <div className="balance-actions-row">
                  <button
                    className="balance-action-btn"
                    onClick={() => setView("funds")}
                  >
                    Manage Funds
                  </button>
                  <button
                    className="balance-action-btn"
                    onClick={() => setView("transactions")}
                  >
                    History
                  </button>
                </div>
              </>
            )}

            {/* Connected Wallets - show embedded wallets and external wallets */}
            {(wallets.length > 0 || bitcoinConnectConnected) && (
              <div className="wallet-section">
                <h3>Connected Wallets</h3>
                <div className="wallet-list">
                  {/* Embedded wallets (Spark, NWC) */}
                  {wallets.map((wallet) => (
                    <div
                      key={wallet.id}
                      className={`wallet-item ${wallet.active ? "active" : ""}`}
                    >
                      <div
                        className={`wallet-item-icon ${wallet.kind === WalletKind.SPARK ? "spark" : "nwc"}`}
                      >
                        {wallet.kind === WalletKind.SPARK ? (
                          <SparkLogo />
                        ) : (
                          <NwcLogo />
                        )}
                      </div>
                      <div className="wallet-item-info">
                        <span className="wallet-item-name">{wallet.name}</span>
                        <span className="wallet-item-type">
                          {wallet.kind === WalletKind.SPARK
                            ? "Self-custodial"
                            : "NWC"}
                        </span>
                      </div>
                      <div className="wallet-item-actions">
                        {wallet.active ? (
                          <span className="wallet-active-badge">Active</span>
                        ) : (
                          <button
                            className="wallet-btn-small"
                            onClick={() => setActiveWallet(wallet.id)}
                          >
                            Use
                          </button>
                        )}
                        <button
                          className="wallet-btn-small danger"
                          onClick={() =>
                            setWalletToRemove({
                              id: wallet.id,
                              name: wallet.name,
                              kind: wallet.kind,
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Bitcoin Connect external wallet */}
                  {bitcoinConnectConnected && (
                    <div className="wallet-item active">
                      <div className="wallet-item-icon bitcoin-connect">
                        <BitcoinConnectLogo />
                      </div>
                      <div className="wallet-item-info">
                        <span className="wallet-item-name">
                          Bitcoin Connect
                        </span>
                        <span className="wallet-item-type">External</span>
                      </div>
                      <div className="wallet-item-actions">
                        <button
                          className="wallet-btn-small danger"
                          onClick={() =>
                            setWalletToRemove({
                              id: "bitcoin-connect",
                              name: "Bitcoin Connect",
                              kind: WalletKind.NWC, // Use NWC kind as placeholder for external
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Lightning Address - show when embedded wallet connected */}
            {hasEmbeddedWallet && !bitcoinConnectConnected && (
              <div className="wallet-section">
                <h3>Lightning Address</h3>
                <button
                  className="wallet-btn secondary"
                  onClick={() => setView("lightning-address")}
                  style={{ width: "100%" }}
                >
                  Manage Lightning Address
                </button>
              </div>
            )}

            {/* Add Wallet - hide when both slots are full */}
            {bitcoinConnectConnected ? (
              // Message when external wallet is active
              <div className="wallet-section">
                <h3>Add Wallet</h3>
                <p className="wallet-hint">
                  Disconnect external wallet to use embedded wallet features.
                </p>
              </div>
            ) : (
              // Show add wallet options only if there's a slot available
              (!hasSparkWallet || !hasNwcWallet) && (
                <div className="wallet-section">
                  <h3>Add Wallet</h3>
                  <div className="wallet-options">
                    {/* Embedded wallet options */}
                    {!hasSparkWallet && (
                      <WalletOptionCard
                        icon={<SparkLogo />}
                        iconClass="spark"
                        title="Self-Custodial Wallet"
                        subtitle="Breez SDK + Spark"
                        onClick={() => setView("spark-options")}
                      />
                    )}
                    {!hasNwcWallet && (
                      <WalletOptionCard
                        icon={<NwcLogo />}
                        iconClass="nwc"
                        title="Nostr Wallet Connect"
                        subtitle="Connect external wallet"
                        onClick={() => setView("add-nwc")}
                      />
                    )}
                    {/* External wallet options - only show if no embedded wallet */}
                    {!hasEmbeddedWallet && (
                      <WalletOptionCard
                        icon={<BitcoinConnectLogo />}
                        iconClass="bitcoin-connect"
                        title="Bitcoin Connect"
                        subtitle="External wallet"
                        onClick={connectBitcoinConnect}
                      />
                    )}
                  </div>
                </div>
              )
            )}

            {/* Backup - hide when external wallets are connected */}
            {!bitcoinConnectConnected && (
              <div className="wallet-section">
                <h3>Backup & Restore</h3>
                <div className="wallet-add-options">
                  <button
                    className="wallet-btn secondary"
                    onClick={() => setView("backup")}
                  >
                    Manage Backups
                  </button>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <p className="wallet-disclaimer">
              <strong>IMPORTANT:</strong> Words With Zaps never holds user
              funds. You manage your own wallet and are responsible for securing
              it properly.
            </p>
          </>
        )}

        {view === "add-nwc" && (
          <>
            <h2>Connect NWC Wallet</h2>
            {error && <div className="wallet-error">{error}</div>}
            <p className="wallet-hint">
              Connect an external wallet using Nostr Wallet Connect.
            </p>

            <div className="spark-options-list">
              {/* Show restore option if backup found */}
              {!checkingNwcBackup && hasNwcBackup && (
                <>
                  <p className="wallet-section-label">Restore from Nostr</p>
                  <button
                    className="spark-option-btn highlight"
                    onClick={handleRestoreNwc}
                    disabled={loading}
                  >
                    {loading ? "Restoring..." : "Restore NWC Backup"}
                    <span className="backup-found-badge">Backup found</span>
                  </button>
                  <div className="wallet-section-divider">
                    <span>or</span>
                  </div>
                </>
              )}
              {checkingNwcBackup && (
                <button className="spark-option-btn" disabled>
                  Restore from Nostr Backup
                  <span className="backup-checking-badge">Checking...</span>
                </button>
              )}

              <p className="wallet-section-label">Enter Connection String</p>
              <textarea
                className="wallet-input"
                placeholder="nostr+walletconnect://..."
                value={nwcUrl}
                onChange={(e) => setNwcUrl(e.target.value)}
                rows={3}
                style={{ marginBottom: 0 }}
              />
              <p className="wallet-hint" style={{ marginBottom: "12px" }}>
                Get this from Alby, Mutiny, or another NWC provider.
              </p>
            </div>

            <button
              className="wallet-btn primary"
              onClick={handleConnectNWC}
              disabled={!nwcUrl.trim() || loading || checkingNwcBackup}
              style={{ width: "100%" }}
            >
              {loading ? "Connecting..." : "Connect"}
            </button>
          </>
        )}

        {view === "spark-options" && (
          <>
            <h2>Self-Custodial Wallet</h2>
            {error && <div className="wallet-error">{error}</div>}
            <p className="wallet-hint">
              Create a new Lightning wallet or restore an existing one.
            </p>

            <div className="spark-options-list">
              {/* Show backup list if backups found */}
              {!checkingBackup && sparkBackups.length > 0 && (
                <>
                  <p className="wallet-section-label">Restore from Nostr</p>
                  {sparkBackups.map((backup) => (
                    <button
                      key={backup.id}
                      className="spark-option-btn highlight"
                      onClick={() => handleRestoreSparkBackup(backup)}
                      disabled={loading}
                    >
                      {loading
                        ? "Restoring..."
                        : backup.isLegacy
                          ? "Spark Wallet"
                          : `Wallet ${backup.walletId?.slice(0, 8)}`}
                      <span className="backup-found-badge">
                        {new Date(backup.createdAt * 1000).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                  <div className="wallet-section-divider">
                    <span>or</span>
                  </div>
                </>
              )}
              {checkingBackup && (
                <button className="spark-option-btn" disabled>
                  Restore from Nostr Backup
                  <span className="backup-checking-badge">Checking...</span>
                </button>
              )}
              <button
                className={`spark-option-btn${sparkBackups.length === 0 && !checkingBackup ? " primary" : ""}`}
                onClick={handleCreateSpark}
                disabled={loading || checkingBackup}
              >
                {loading ? "Creating..." : "Create New Wallet"}
              </button>
              <button
                className="spark-option-btn"
                onClick={() => setView("spark-restore-phrase")}
                disabled={loading || checkingBackup}
              >
                Restore from Recovery Phrase
              </button>
            </div>
          </>
        )}

        {view === "spark-restore-phrase" && (
          <>
            <h2>Restore Wallet</h2>
            {error && <div className="wallet-error">{error}</div>}
            <p className="wallet-hint">
              Enter your 12-word recovery phrase to restore your wallet.
            </p>
            <textarea
              className="wallet-input"
              placeholder="word1 word2 word3 ..."
              value={sparkMnemonic}
              onChange={(e) => setSparkMnemonic(e.target.value)}
              rows={3}
            />
            <div className="wallet-actions">
              <button
                className="wallet-btn secondary"
                onClick={() => {
                  setView("spark-options");
                  setError(null);
                  setSparkMnemonic("");
                }}
              >
                Back
              </button>
              <button
                className="wallet-btn primary"
                onClick={handleImportSpark}
                disabled={!sparkMnemonic.trim() || loading}
              >
                {loading ? "Importing..." : "Import Wallet"}
              </button>
            </div>
          </>
        )}

        {view === "backup" && (
          <>
            <h2>Manage Backups</h2>
            {error && <div className="wallet-error">{error}</div>}
            {backupStatus && (
              <div className="wallet-success">{backupStatus}</div>
            )}

            <p className="wallet-hint" style={{ marginBottom: "16px" }}>
              Backups are encrypted with your Nostr key and stored on relays.
            </p>

            {hasSparkWallet && (
              <div className="wallet-section">
                <h3>Spark Wallet</h3>
                <div className="backup-actions-column">
                  <button
                    className="wallet-btn secondary"
                    onClick={handleViewMnemonic}
                    disabled={loading}
                  >
                    View Recovery Phrase
                  </button>
                  <div className="backup-actions">
                    <button
                      className="wallet-btn secondary"
                      onClick={handleBackupSpark}
                      disabled={loading}
                    >
                      Backup to Nostr
                    </button>
                    <button
                      className="wallet-btn danger"
                      onClick={() => setBackupToDelete("spark")}
                      disabled={loading}
                    >
                      Delete Backup
                    </button>
                  </div>
                </div>
              </div>
            )}

            {wallets.some((w) => w.kind === WalletKind.NWC) && (
              <div className="wallet-section">
                <h3>NWC Connection</h3>
                <div className="backup-actions-column">
                  <button
                    className="wallet-btn secondary"
                    onClick={() => setShowNwcString(!showNwcString)}
                    disabled={loading}
                  >
                    {showNwcString
                      ? "Hide Connection String"
                      : "View Connection String"}
                  </button>
                  {showNwcString && (
                    <div className="nwc-string-display">
                      <code className="nwc-string-text">
                        {getNwcConnectionUrl() || "No connection URL"}
                      </code>
                      <button
                        className="wallet-btn-small"
                        onClick={handleCopyNwcString}
                      >
                        {copiedNwc ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  )}
                  <div className="backup-actions">
                    <button
                      className="wallet-btn secondary"
                      onClick={handleBackupNwc}
                      disabled={loading}
                    >
                      Backup to Nostr
                    </button>
                    <button
                      className="wallet-btn danger"
                      onClick={() => setBackupToDelete("nwc")}
                      disabled={loading}
                    >
                      Delete Backup
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Backup deletion confirmation */}
            {backupToDelete && (
              <div className="backup-confirm-overlay">
                <div className="backup-confirm-modal">
                  <p>
                    Delete {backupToDelete === "spark" ? "Spark wallet" : "NWC"}{" "}
                    backup from Nostr relays?
                  </p>
                  <p className="wallet-hint">
                    You can create a new backup anytime.
                  </p>
                  <div className="wallet-actions" style={{ marginTop: "16px" }}>
                    <button
                      className="wallet-btn secondary"
                      onClick={() => setBackupToDelete(null)}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                    <button
                      className="wallet-btn danger"
                      onClick={handleConfirmDeleteBackup}
                      disabled={loading}
                    >
                      {loading ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View mnemonic modal */}
            {showMnemonic && viewMnemonic && (
              <div className="backup-confirm-overlay">
                <div className="mnemonic-modal">
                  <h2>Recovery Phrase</h2>
                  <div className="mnemonic-grid">
                    {viewMnemonic.split(" ").map((word, i) => (
                      <div key={i} className="mnemonic-word">
                        <span className="mnemonic-num">{i + 1}.</span> {word}
                      </div>
                    ))}
                  </div>
                  <div className="mnemonic-warnings">
                    <p>Keep this phrase safe and secret.</p>
                    <p>Anyone with these words can access your funds.</p>
                  </div>
                  <button
                    className="wallet-btn primary"
                    onClick={() => {
                      setShowMnemonic(false);
                      setViewMnemonic(null);
                    }}
                    style={{ width: "100%" }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {!hasSparkWallet &&
              !wallets.some((w) => w.kind === WalletKind.NWC) && (
                <p className="wallet-hint">No wallets to manage backups for.</p>
              )}
          </>
        )}

        {view === "transactions" && (
          <>
            <h2>Recent Transactions</h2>
            <div className="transactions-list">
              {loadingTransactions && transactions.length === 0 ? (
                <p className="wallet-empty">Loading...</p>
              ) : transactions.length === 0 ? (
                <p className="wallet-empty">No transactions yet</p>
              ) : (
                <>
                  {transactions.map((tx) => (
                    <div key={tx.id} className="transaction-item">
                      <div className="transaction-icon">
                        {tx.type === "incoming" ? (
                          <span className="tx-incoming">↓</span>
                        ) : (
                          <span className="tx-outgoing">↑</span>
                        )}
                      </div>
                      <div className="transaction-info">
                        <span className="transaction-description">
                          {tx.description ||
                            (tx.type === "incoming" ? "Received" : "Sent")}
                        </span>
                        <span className="transaction-date">
                          {new Date(tx.timestamp * 1000).toLocaleString()}
                        </span>
                      </div>
                      <div className="transaction-amount">
                        <span
                          className={
                            tx.type === "incoming"
                              ? "amount-incoming"
                              : "amount-outgoing"
                          }
                        >
                          {tx.type === "incoming" ? "+" : "-"}
                          {tx.amountSats.toLocaleString()} sats
                        </span>
                        {tx.feesSats !== undefined && tx.feesSats > 0 && (
                          <span className="transaction-fee">
                            Fee: {tx.feesSats} sats
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {hasMoreTransactions && (
                    <button
                      className="wallet-btn secondary load-more-btn"
                      onClick={() => loadTransactions(false)}
                      disabled={loadingTransactions}
                    >
                      {loadingTransactions ? "Loading..." : "Load More"}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {view === "lightning-address" && (
          <>
            <h2>Lightning Address</h2>
            {error && <div className="wallet-error">{error}</div>}
            {backupStatus && (
              <div className="wallet-success">{backupStatus}</div>
            )}

            {/* Current Wallet Addresses */}
            <div className="wallet-section">
              <h3>Wallet Addresses</h3>

              {/* Spark wallet address */}
              {hasSparkWallet && (
                <div className="ln-address-item">
                  <div className="ln-address-wallet">
                    <div className="wallet-item-icon spark">
                      <SparkLogo />
                    </div>
                    <span>Spark Wallet</span>
                  </div>
                  {sparkLnAddressLoading ? (
                    <p className="wallet-hint" style={{ margin: "8px 0 0" }}>
                      Loading...
                    </p>
                  ) : sparkLnAddress ? (
                    <div className="ln-address-value">
                      <span className="ln-address-text">{sparkLnAddress}</span>
                      {sparkLnAddress.endsWith("@breez.tips") && (
                        <button
                          className="wallet-btn-small danger"
                          onClick={() => setLnAddressToDelete(true)}
                          disabled={loading}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="ln-address-setup">
                      <div className="ln-address-input-row">
                        <input
                          type="text"
                          className="ln-address-input"
                          placeholder="username"
                          value={newUsername}
                          onChange={(e) =>
                            setNewUsername(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9]/g, ""),
                            )
                          }
                          disabled={loading}
                        />
                        <span className="ln-address-domain">@breez.tips</span>
                      </div>
                      {checkingUsername && (
                        <span className="ln-address-status checking">
                          Checking...
                        </span>
                      )}
                      {!checkingUsername &&
                        usernameAvailable === true &&
                        newUsername && (
                          <span className="ln-address-status available">
                            Available!
                          </span>
                        )}
                      {!checkingUsername &&
                        usernameAvailable === false &&
                        newUsername && (
                          <span className="ln-address-status taken">
                            Already taken
                          </span>
                        )}
                      <button
                        className="wallet-btn primary"
                        onClick={handleRegisterLightningAddress}
                        disabled={
                          loading || !newUsername.trim() || !usernameAvailable
                        }
                        style={{ marginTop: "8px" }}
                      >
                        {loading ? "Registering..." : "Register Address"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* NWC wallet address */}
              {wallets.some((w) => w.kind === WalletKind.NWC) && (
                <div className="ln-address-item">
                  <div className="ln-address-wallet">
                    <div className="wallet-item-icon nwc">
                      <NwcLogo />
                    </div>
                    <span>NWC Wallet</span>
                  </div>
                  {nwcLnAddress ? (
                    <div className="ln-address-value">
                      <span className="ln-address-text">{nwcLnAddress}</span>
                    </div>
                  ) : (
                    <p className="wallet-hint" style={{ margin: "8px 0 0" }}>
                      No lightning address in connection string
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Profile Lightning Address */}
            <div className="wallet-section">
              <h3>Nostr Profile Address</h3>
              <p className="wallet-hint" style={{ marginBottom: "12px" }}>
                This is the lightning address shown on your Nostr profile for
                receiving zaps.
              </p>

              {profileLnAddress && (
                <div className="ln-address-current">
                  <span className="ln-address-label">Current:</span>
                  <span className="ln-address-text">{profileLnAddress}</span>
                </div>
              )}

              {/* Show update option if active wallet has an address different from profile */}
              {(() => {
                const activeAddr = getActiveWalletLightningAddress();
                const needsUpdate =
                  activeAddr && activeAddr !== profileLnAddress;
                const activeWalletName =
                  activeWallet?.kind === WalletKind.SPARK ? "Spark" : "NWC";

                if (needsUpdate) {
                  return (
                    <div className="ln-address-update">
                      <p
                        className="wallet-hint"
                        style={{ marginBottom: "8px" }}
                      >
                        Your active {activeWalletName} wallet has address:{" "}
                        <strong>{activeAddr}</strong>
                      </p>
                      <button
                        className="wallet-btn primary"
                        onClick={() =>
                          handleUpdateProfileLightningAddress(activeAddr)
                        }
                        disabled={loading}
                        style={{ width: "100%" }}
                      >
                        {loading
                          ? "Updating..."
                          : `Update Profile to ${activeAddr}`}
                      </button>
                    </div>
                  );
                }

                if (!profileLnAddress && !activeAddr) {
                  return (
                    <p className="wallet-hint">
                      Set up a lightning address above to update your profile.
                    </p>
                  );
                }

                if (profileLnAddress === activeAddr) {
                  return (
                    <p className="ln-address-match">
                      ✓ Profile matches your active wallet
                    </p>
                  );
                }

                return null;
              })()}
            </div>

            {/* Delete confirmation modal */}
            {lnAddressToDelete && (
              <div className="backup-confirm-overlay">
                <div className="backup-confirm-modal">
                  <p>Delete your @breez.tips lightning address?</p>
                  <p className="wallet-hint">
                    You can register a new one anytime.
                  </p>
                  <div className="wallet-actions" style={{ marginTop: "16px" }}>
                    <button
                      className="wallet-btn secondary"
                      onClick={() => setLnAddressToDelete(false)}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                    <button
                      className="wallet-btn danger"
                      onClick={handleDeleteLightningAddress}
                      disabled={loading}
                    >
                      {loading ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {view === "funds" && (
          <FundsView
            balance={state.balance}
            lightningAddress={getActiveWalletLightningAddress()}
            onBack={() => setView("main")}
            onBalanceChange={() => refreshBalance(true)}
            onToast={onToast}
          />
        )}
      </div>
    </div>
  );
}

export default WalletSettings;
