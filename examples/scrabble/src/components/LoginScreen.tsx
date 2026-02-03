import { useState, useCallback, useEffect, useRef } from "react";
import type { NDKUser } from "@nostr-dev-kit/ndk";
import { QRCodeSVG } from "qrcode.react";
import type { NostrConnectSession } from "@nostr-gaming-engine/core";
import {
  BoltIcon,
  LockIcon,
  KeyIcon,
  CameraIcon,
  ClipboardIcon,
} from "./icons/LoginIcons";
import "./LoginScreen.css";

type LoginView =
  | "main"
  | "nip46-options"
  | "nip46-qr"
  | "nip46-bunker"
  | "create-keys"
  | "create-profile";

interface GeneratedKeys {
  nsec: string;
  npub: string;
  secretKeyHex: string;
}

interface LoginScreenProps {
  onConnected: () => void;
  user: NDKUser | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  connectWithPrivateKey: (privateKeyHex: string) => Promise<void>;
  connectWithBunker: (bunkerUri: string) => Promise<void>;
  generateKeypair: () => GeneratedKeys;
  startNostrConnect: () => Promise<NostrConnectSession>;
  waitForNostrConnect: (session: NostrConnectSession) => Promise<void>;
  cancelNostrConnect: () => void;
}

export function LoginScreen({
  onConnected,
  user,
  isConnecting,
  error,
  connect,
  connectWithPrivateKey,
  connectWithBunker,
  generateKeypair,
  startNostrConnect,
  waitForNostrConnect,
  cancelNostrConnect,
}: LoginScreenProps) {
  const [view, setView] = useState<LoginView>("main");
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(
    null,
  );
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bunkerUri, setBunkerUri] = useState("");
  const [nip46Waiting, setNip46Waiting] = useState(false);
  const [nip46Timeout, setNip46Timeout] = useState(60);
  const [copied, setCopied] = useState<string | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState<string | null>(null);
  const nostrConnectSessionRef = useRef<NostrConnectSession | null>(null);
  const timeoutRef = useRef<number | null>(null);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
      }
    };
  }, []);

  const handleExtensionConnect = async () => {
    try {
      await connect();
      onConnected();
    } catch {
      // Error is displayed via the error prop
    }
  };

  const handleCreateAccount = useCallback(() => {
    const keys = generateKeypair();
    setGeneratedKeys(keys);
    setView("create-keys");
  }, [generateKeypair]);

  const downloadBackupFile = useCallback(() => {
    if (!generatedKeys) return;

    const date = new Date().toISOString().split("T")[0];
    const content = `Words With Zaps - Nostr Keys Backup
Generated: ${new Date().toLocaleString()}

PRIVATE KEY (keep secret!):
${generatedKeys.nsec}

PUBLIC KEY (safe to share):
${generatedKeys.npub}

WARNING: Never share your private key. Store this file securely.`;

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wordswithzaps-keys-${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupDownloaded(true);
  }, [generatedKeys]);

  const handleKeysConfirmed = useCallback(() => {
    setView("create-profile");
  }, []);

  const handleFinishCreate = useCallback(async () => {
    if (!generatedKeys) return;
    try {
      await connectWithPrivateKey(generatedKeys.secretKeyHex);
      // TODO: If displayName is set, update profile
      onConnected();
    } catch {
      // Error handled by hook
    }
  }, [generatedKeys, connectWithPrivateKey, onConnected]);

  const handleBunkerConnect = useCallback(async () => {
    if (!bunkerUri.trim()) return;

    setNip46Waiting(true);
    setNip46Timeout(60);

    // Start countdown timer
    timeoutRef.current = window.setInterval(() => {
      setNip46Timeout((prev) => {
        if (prev <= 1) {
          if (timeoutRef.current) {
            clearInterval(timeoutRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      await connectWithBunker(bunkerUri.trim());
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
      }
      onConnected();
    } catch {
      if (timeoutRef.current) {
        clearInterval(timeoutRef.current);
      }
      setNip46Waiting(false);
      // Error handled by hook
    }
  }, [bunkerUri, connectWithBunker, onConnected]);

  const handleShowQRCode = useCallback(async () => {
    setView("nip46-qr");
    try {
      const session = await startNostrConnect();
      setNostrConnectUri(session.uri);
      nostrConnectSessionRef.current = session;

      // Start waiting for connection in background
      waitForNostrConnect(session)
        .then(() => {
          onConnected();
        })
        .catch(() => {
          // Error handled by hook or cancelled
        });
    } catch {
      // Error handled by hook
    }
  }, [startNostrConnect, waitForNostrConnect, onConnected]);

  const handleCancelQR = useCallback(() => {
    cancelNostrConnect();
    setNostrConnectUri(null);
    nostrConnectSessionRef.current = null;
    setView("nip46-options");
  }, [cancelNostrConnect]);

  const handleCancelNip46 = useCallback(() => {
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
    }
    setNip46Waiting(false);
    setNip46Timeout(60);
  }, []);

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const resetToMain = useCallback(() => {
    setView("main");
    setGeneratedKeys(null);
    setShowPrivateKey(false);
    setBackupDownloaded(false);
    setBackupConfirmed(false);
    setDisplayName("");
    setBunkerUri("");
    setNip46Waiting(false);
    setNostrConnectUri(null);
    nostrConnectSessionRef.current = null;
    cancelNostrConnect();
    if (timeoutRef.current) {
      clearInterval(timeoutRef.current);
    }
  }, [cancelNostrConnect]);

  // If user is connected, show continue button
  if (user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <img
            src="/assets/wwz_logo_stack.svg"
            alt="Words With Zaps"
            className="login-logo"
          />
          <div className="login-connected">
            <p>Connected as:</p>
            <p className="login-pubkey">
              {user.profile?.name || user.pubkey.slice(0, 16)}...
            </p>
            <button className="login-btn" onClick={onConnected}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img
          src="/assets/wwz_logo_stack.svg"
          alt="Words With Zaps"
          className="login-logo"
        />
        <p className="login-subtitle">A P2P Crossword Game on Nostr</p>

        {error && <div className="login-error">{error}</div>}

        {/* Main View - Option Cards */}
        {view === "main" && (
          <div className="login-options">
            {/* Extension Option */}
            <button
              className="login-option-card extension"
              onClick={handleExtensionConnect}
              disabled={isConnecting}
            >
              <div className="login-option-icon icon-yellow">
                <BoltIcon />
              </div>
              <div className="login-option-content">
                <div className="login-option-title">
                  {isConnecting ? "Connecting..." : "Browser Extension"}
                </div>
                <div className="login-option-desc">
                  Alby, nos2x, or other NIP-07 extension
                </div>
              </div>
            </button>

            {/* Remote Signer Option */}
            <button
              className="login-option-card remote"
              onClick={() => setView("nip46-options")}
              disabled={isConnecting}
            >
              <div className="login-option-icon icon-purple">
                <LockIcon />
              </div>
              <div className="login-option-content">
                <div className="login-option-title">Remote Signer</div>
                <div className="login-option-desc">
                  Amber, Primal, or NIP-46 bunker
                </div>
              </div>
            </button>

            {/* Create Account Option */}
            <button
              className="login-option-card create"
              onClick={handleCreateAccount}
              disabled={isConnecting}
            >
              <div className="login-option-icon icon-green">
                <KeyIcon />
              </div>
              <div className="login-option-content">
                <div className="login-option-title">Create New Account</div>
                <div className="login-option-desc">
                  Generate a new Nostr key pair
                </div>
              </div>
            </button>
          </div>
        )}

        {/* NIP-46 Options */}
        {view === "nip46-options" && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <div className="login-option-icon icon-purple">
                <LockIcon />
              </div>
              <div className="login-option-title">Remote Signer</div>
            </div>

            <div className="login-suboptions">
              <button className="login-suboption" onClick={handleShowQRCode}>
                <span className="login-suboption-icon icon-blue">
                  <CameraIcon />
                </span>
                <div>
                  <div className="login-suboption-title">Scan QR Code</div>
                  <div className="login-suboption-desc">
                    For Primal mobile and other apps
                  </div>
                </div>
              </button>

              <button
                className="login-suboption"
                onClick={() => setView("nip46-bunker")}
              >
                <span className="login-suboption-icon icon-orange">
                  <ClipboardIcon />
                </span>
                <div>
                  <div className="login-suboption-title">Paste Bunker URL</div>
                  <div className="login-suboption-desc">
                    For Amber and other signers
                  </div>
                </div>
              </button>
            </div>

            <button className="login-cancel" onClick={resetToMain}>
              Cancel
            </button>
          </div>
        )}

        {/* NIP-46 QR Code */}
        {view === "nip46-qr" && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <span className="login-suboption-icon icon-blue">
                <CameraIcon />
              </span>
              <div className="login-option-title">Scan with Remote Signer</div>
            </div>

            {nostrConnectUri ? (
              <div className="login-qr-container">
                <div className="login-qr-code">
                  <QRCodeSVG
                    value={nostrConnectUri}
                    size={200}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="H"
                    imageSettings={{
                      src: "/favicon.svg",
                      height: 28,
                      width: 28,
                      excavate: true,
                    }}
                  />
                </div>

                <div className="login-qr-uri">
                  <span className="login-qr-uri-text">
                    {nostrConnectUri.substring(0, 32)}...
                  </span>
                  <button
                    className="login-qr-copy"
                    onClick={() =>
                      copyToClipboard(nostrConnectUri, "nostrconnect")
                    }
                  >
                    {copied === "nostrconnect" ? "✓" : "Copy"}
                  </button>
                </div>

                <div className="login-qr-waiting">
                  <div className="login-spinner-small" />
                  <span>Waiting for connection...</span>
                </div>
              </div>
            ) : (
              <div className="login-qr-loading">
                <div className="login-spinner" />
                <p>Generating QR code...</p>
              </div>
            )}

            <button className="login-cancel" onClick={handleCancelQR}>
              Cancel
            </button>
          </div>
        )}

        {/* NIP-46 Bunker URL */}
        {view === "nip46-bunker" && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <span className="login-suboption-icon icon-orange">
                <ClipboardIcon />
              </span>
              <div className="login-option-title">Paste Bunker URL</div>
            </div>

            {!nip46Waiting ? (
              <>
                <input
                  type="text"
                  className="login-input"
                  placeholder="bunker://..."
                  value={bunkerUri}
                  onChange={(e) => setBunkerUri(e.target.value)}
                />

                <div className="login-btn-row">
                  <button
                    className="login-btn-secondary"
                    onClick={() => setView("nip46-options")}
                  >
                    Back
                  </button>
                  <button
                    className="login-btn"
                    onClick={handleBunkerConnect}
                    disabled={!bunkerUri.trim() || isConnecting}
                  >
                    Connect
                  </button>
                </div>

                <p className="login-hint">
                  Paste a bunker:// URL from Amber or another signer
                </p>
              </>
            ) : (
              <div className="login-waiting">
                <div className="login-spinner" />
                <p className="login-waiting-text">
                  Waiting for approval from remote signer...
                </p>
                <p className="login-waiting-timeout">
                  Timeout in {nip46Timeout}s
                </p>
                <button
                  className="login-btn-secondary"
                  onClick={handleCancelNip46}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Create Account - Keys Step */}
        {view === "create-keys" && generatedKeys && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <span className="login-suboption-icon icon-green">
                <KeyIcon />
              </span>
              <div className="login-option-title">Your New Keys</div>
            </div>

            <div className="login-key-section">
              <div className="login-key-label">
                <span>Private Key</span>
                <button
                  className="login-key-toggle"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? "Hide" : "Show"}
                </button>
              </div>
              <div
                className={`login-key-box ${showPrivateKey ? "" : "masked"}`}
              >
                {showPrivateKey
                  ? generatedKeys.nsec
                  : "••••••••••••••••••••••••••••••••••••••••••••••••"}
                <button
                  className="login-key-copy"
                  onClick={() => copyToClipboard(generatedKeys.nsec, "nsec")}
                >
                  {copied === "nsec" ? "✓" : "Copy"}
                </button>
              </div>
            </div>

            <div className="login-key-section">
              <div className="login-key-label">
                <span>Public Key</span>
              </div>
              <div className="login-key-box public">
                {generatedKeys.npub}
                <button
                  className="login-key-copy"
                  onClick={() => copyToClipboard(generatedKeys.npub, "npub")}
                >
                  {copied === "npub" ? "✓" : "Copy"}
                </button>
              </div>
            </div>

            <div className="login-backup-section">
              <button
                className={`login-backup-btn ${backupDownloaded ? "downloaded" : ""}`}
                onClick={downloadBackupFile}
              >
                {backupDownloaded
                  ? "✓ Backup Downloaded"
                  : "Download Backup File"}
              </button>

              <label className="login-backup-checkbox">
                <input
                  type="checkbox"
                  checked={backupConfirmed}
                  onChange={(e) => setBackupConfirmed(e.target.checked)}
                  disabled={!backupDownloaded}
                />
                <span>I saved my backup securely</span>
              </label>
            </div>

            <div className="login-btn-row">
              <button className="login-btn-secondary" onClick={resetToMain}>
                Cancel
              </button>
              <button
                className="login-btn"
                onClick={handleKeysConfirmed}
                disabled={!backupDownloaded || !backupConfirmed}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Create Account - Profile Step */}
        {view === "create-profile" && (
          <div className="login-expanded">
            <div className="login-expanded-header">
              <span className="login-suboption-icon">👤</span>
              <div className="login-option-title">Set Display Name</div>
            </div>

            <input
              type="text"
              className="login-input"
              placeholder="Display name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />

            <div className="login-btn-row">
              <button
                className="login-btn-secondary"
                onClick={handleFinishCreate}
                disabled={isConnecting}
              >
                Skip
              </button>
              <button
                className="login-btn"
                onClick={handleFinishCreate}
                disabled={isConnecting}
              >
                {isConnecting ? "Creating..." : "Continue"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
