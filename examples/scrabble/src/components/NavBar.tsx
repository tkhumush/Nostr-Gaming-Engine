import { useEffect, useRef, useState } from "react";
import type { NDKUser } from "@nostr-dev-kit/ndk";
import type { WalletProviderType } from "@nostr-gaming-engine/core";

import {
  SparkLogo,
  NwcLogo,
  BitcoinConnectLogo,
  EyeIcon,
} from "./icons/WalletIcons";
import "./NavBar.css";

const BALANCE_HIDDEN_KEY = "wordswithzaps_wallet_balance_hidden";

interface NavBarProps {
  user: NDKUser | null;
  onDisconnect: () => void;
  onBackToLobby?: () => void;
  onOpenSupportZap?: () => void;
  walletConnected?: boolean;
  walletBalance?: number;
  walletLoading?: boolean;
  walletType?: WalletProviderType;
  onOpenWalletSettings?: () => void;
  onOpenProfileSettings?: () => void;
  onOpenAbout?: () => void;
  onShareGame?: () => void;
  connectionMethod?: "nip07" | "private-key" | "nip46" | null;
  relayCount?: number;
  onOpenRelayList?: () => void;
}

function WalletTypeIcon({ walletType }: { walletType?: WalletProviderType }) {
  if (walletType === "spark") {
    return <SparkLogo className="wallet-type-icon spark" />;
  }
  if (walletType === "nwc") {
    return <NwcLogo className="wallet-type-icon nwc" />;
  }
  if (walletType === "bitcoin-connect") {
    return <BitcoinConnectLogo className="wallet-type-icon bitcoin-connect" />;
  }
  return null;
}

export function NavBar({
  user,
  onDisconnect,
  onBackToLobby,
  onOpenSupportZap,
  walletConnected,
  walletBalance,
  walletLoading: _walletLoading,
  walletType,
  onOpenWalletSettings,
  onOpenProfileSettings,
  onOpenAbout,
  onShareGame,
  connectionMethod,
  relayCount,
  onOpenRelayList,
}: NavBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [hideBalance, setHideBalance] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(BALANCE_HIDDEN_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [profileSnapshot, setProfileSnapshot] = useState<Record<
    string,
    unknown
  > | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setWalletMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(BALANCE_HIDDEN_KEY, String(hideBalance));
    } catch {
      // Ignore storage errors
    }
  }, [hideBalance]);

  useEffect(() => {
    if (!user) {
      setProfileSnapshot(null);
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      try {
        await user.fetchProfile();
      } catch {
        // Ignore fetch errors; we'll still try to read cached profile.
      }

      if (cancelled) return;
      if (user.profile) {
        setProfileSnapshot({ ...user.profile });
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [user?.pubkey]);

  const profile =
    (profileSnapshot as {
      displayName?: string;
      display_name?: string;
      name?: string;
      picture?: string;
      image?: string;
    } | null) || user?.profile;
  const displayName =
    profile?.displayName || profile?.display_name || profile?.name || "You";
  const picture = profile?.picture || profile?.image;
  const balanceKnown = walletBalance !== undefined && walletBalance !== null;
  const hasWallet = walletConnected || walletType !== "none";
  const isExternalWallet = walletType === "bitcoin-connect";
  // External wallets don't show balance text, just the bolt icon
  const balanceText = isExternalWallet
    ? null
    : balanceKnown
      ? walletBalance.toLocaleString()
      : hasWallet
        ? "..."
        : "Set up";
  const walletTypeLabel =
    walletType === "spark"
      ? "Spark Wallet"
      : walletType === "nwc"
        ? "NWC Wallet"
        : walletType === "bitcoin-connect"
          ? "Bitcoin Connect"
          : "No wallet connected";

  return (
    <nav className="main-nav">
      <div className="nav-left">
        <img
          src="/assets/wwz_logo_full_horiz.svg"
          alt="Words With Zaps"
          className={`nav-logo full ${onBackToLobby ? "clickable" : ""}`}
          onClick={onBackToLobby}
        />
        <img
          src="/assets/wwz_logo_abbr_horiz.svg"
          alt="Words With Zaps"
          className={`nav-logo abbr ${onBackToLobby ? "clickable" : ""}`}
          onClick={onBackToLobby}
        />
      </div>

      <div className="nav-right" ref={menuRef}>
        {onOpenWalletSettings && (
          <div className="wallet-menu-wrap">
            <button
              className={`wallet-status-btn ${hideBalance ? "balance-hidden" : ""} ${isExternalWallet ? "external-wallet" : ""}`}
              onClick={() => {
                setWalletMenuOpen((prev) => !prev);
                setMenuOpen(false);
              }}
              title="Wallet"
            >
              <img
                src="/assets/bolt-yellow.svg"
                alt=""
                className={`bolt-icon ${walletConnected ? "connected" : ""}`}
              />
              {!hideBalance && balanceText && (
                <span className="wallet-balance-text">{balanceText}</span>
              )}
            </button>
            {walletMenuOpen && (
              <div className="wallet-menu">
                <div className="wallet-menu-header">
                  {walletType !== "none" && (
                    <WalletTypeIcon walletType={walletType} />
                  )}
                  <span className="wallet-menu-title">{walletTypeLabel}</span>
                </div>
                {!isExternalWallet && walletType !== "none" && (
                  <button
                    className="menu-item icon-row"
                    onClick={() => {
                      setHideBalance((prev) => !prev);
                    }}
                  >
                    <EyeIcon className="menu-icon" />
                    {hideBalance ? "Show balance" : "Hide balance"}
                  </button>
                )}
                <button
                  className="menu-item open-wallet"
                  onClick={() => {
                    setWalletMenuOpen(false);
                    onOpenWalletSettings();
                  }}
                >
                  Open Wallet
                </button>
              </div>
            )}
          </div>
        )}

        <button
          className="user-button"
          onClick={() => {
            setMenuOpen((prev) => !prev);
            setWalletMenuOpen(false);
          }}
        >
          {picture ? (
            <img
              src={picture}
              alt={String(displayName)}
              className="user-avatar"
              onError={(event) => {
                (event.target as HTMLImageElement).src =
                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999999' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z'/%3E%3Cpath d='M4 20c0-4 3.6-6 8-6s8 2 8 6'/%3E%3C/svg%3E";
              }}
            />
          ) : (
            <div className="user-avatar fallback">
              {String(displayName).charAt(0).toUpperCase()}
            </div>
          )}
          <span className="user-name">{displayName}</span>
          <span className={`menu-caret ${menuOpen ? "open" : ""}`}>▾</span>
        </button>

        {menuOpen && (
          <div className="user-menu">
            {onShareGame && (
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onShareGame();
                }}
              >
                Copy Game Link
              </button>
            )}
            {onBackToLobby && (
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onBackToLobby();
                }}
              >
                Back to Lobby
              </button>
            )}
            {onOpenProfileSettings && (
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenProfileSettings();
                }}
              >
                Edit Profile
              </button>
            )}
            {onOpenSupportZap && (
              <button
                className="menu-item support"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSupportZap();
                }}
              >
                Zap to support!
              </button>
            )}
            {onOpenAbout && (
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenAbout();
                }}
              >
                About
              </button>
            )}

            <div className="menu-section">
              <div className="menu-section-title">Connection</div>
              <div className="menu-info-row">
                <span>Method</span>
                <span>
                  {connectionMethod === "nip07"
                    ? "Extension"
                    : connectionMethod === "private-key"
                      ? "Private Key"
                      : connectionMethod === "nip46"
                        ? "Remote Signer"
                        : "—"}
                </span>
              </div>
              <div className="menu-info-row">
                <span>Relays</span>
                {onOpenRelayList ? (
                  <button
                    className="menu-link"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenRelayList();
                    }}
                  >
                    {relayCount ?? 0}
                  </button>
                ) : (
                  <span>{relayCount ?? 0}</span>
                )}
              </div>
            </div>
            <button
              className="menu-item danger"
              onClick={() => {
                setMenuOpen(false);
                onDisconnect();
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default NavBar;
