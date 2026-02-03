import { useEffect, useMemo, useRef, useState } from "react";
import {
  getShareToNostrDefault,
  setShareToNostrDefault,
  getShareMethodDefault,
  setShareMethodDefault,
  getSaveShareSettingDefault,
  setSaveShareSettingDefault,
  getZapNudgeDefaultAmount,
  setZapNudgeDefaultAmount,
  type ShareMethod,
} from "@nostr-gaming-engine/core";
import "./ZapNudgeModal.css";

type ShareMode = "none" | ShareMethod;
type ShareOption = { value: ShareMode; label: string };

interface ZapNudgeModalProps {
  open: boolean;
  word: string;
  points: number;
  myScore: number;
  opponentScore: number;
  opponentLabel: string;
  walletConnected: boolean;
  zapsDisabled: boolean;
  sharePreviewTextPublic: string;
  sharePreviewTextPrivate: string;
  onConfirm: (options: {
    zapAmount: number;
    shareMode: ShareMode;
  }) => void | Promise<void>;
  onClose: () => void;
  onOpenWalletSettings?: () => void;
}

const PRESET_AMOUNTS = [21, 50, 100, 500];
const SHARE_OPTIONS: ShareOption[] = [
  { value: "none", label: "Don't share" },
  { value: "public", label: "Public note (kind 1)" },
  { value: "private", label: "Private DM (kind 4)" },
];

export function ZapNudgeModal({
  open,
  word,
  points,
  myScore,
  opponentScore,
  opponentLabel,
  walletConnected,
  zapsDisabled,
  sharePreviewTextPublic,
  sharePreviewTextPrivate,
  onConfirm,
  onClose,
  onOpenWalletSettings,
}: ZapNudgeModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | "custom" | 0>(
    getZapNudgeDefaultAmount(),
  );
  const [customAmount, setCustomAmount] = useState(() => {
    const saved = getZapNudgeDefaultAmount();
    return saved > 0 && !PRESET_AMOUNTS.includes(saved) ? String(saved) : "";
  });
  const [shareMode, setShareMode] = useState<ShareMode>(() => {
    if (!getShareToNostrDefault()) return "none";
    return getShareMethodDefault();
  });
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const [saveShareSetting, setSaveShareSetting] = useState(() =>
    getSaveShareSettingDefault(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (open) {
      setShareMenuOpen(false);
      setIsSubmitting(false);
      const saved = getZapNudgeDefaultAmount();
      setSelectedAmount(
        saved > 0 && !PRESET_AMOUNTS.includes(saved) ? "custom" : saved,
      );
      setCustomAmount(
        saved > 0 && !PRESET_AMOUNTS.includes(saved) ? String(saved) : "",
      );
      setSaveShareSetting(getSaveShareSettingDefault());
      if (!getShareToNostrDefault()) {
        setShareMode("none");
      } else {
        setShareMode(getShareMethodDefault());
      }
    }
  }, [open]);

  const customAmountValue = useMemo(() => {
    const parsed = parseInt(customAmount, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [customAmount]);

  const resolvedZapAmount = useMemo(() => {
    if (zapsDisabled || !walletConnected) return 0;
    if (selectedAmount === "custom") return customAmountValue;
    return selectedAmount;
  }, [customAmountValue, selectedAmount, walletConnected, zapsDisabled]);

  const customAmountInvalid =
    selectedAmount === "custom" && customAmountValue <= 0;
  const hasZap = resolvedZapAmount > 0;
  const hasShare = shareMode !== "none";
  const shareLabel =
    SHARE_OPTIONS.find((option) => option.value === shareMode)?.label ||
    "Don't share";
  const confirmLabel = useMemo(() => {
    if (hasZap && hasShare) return "Zap & Share";
    if (hasZap && !hasShare) return "Zap";
    if (!hasZap && hasShare) return "Share";
    return "Done";
  }, [hasShare, hasZap]);
  const sharePreviewText =
    shareMode === "private" ? sharePreviewTextPrivate : sharePreviewTextPublic;

  useEffect(() => {
    if (!saveShareSetting) return;
    if (shareMode === "none") {
      setShareToNostrDefault(false);
      return;
    }
    setShareToNostrDefault(true);
    setShareMethodDefault(shareMode);
  }, [shareMode, saveShareSetting]);

  useEffect(() => {
    const amount =
      selectedAmount === "custom" ? customAmountValue : selectedAmount;
    if (amount >= 0) {
      setZapNudgeDefaultAmount(amount);
    }
  }, [customAmountValue, selectedAmount]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!shareMenuOpen) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (!shareMenuRef.current) return;
      if (!shareMenuRef.current.contains(event.target as Node)) {
        setShareMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShareMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [shareMenuOpen]);

  useEffect(() => {
    if (isSubmitting && shareMenuOpen) {
      setShareMenuOpen(false);
    }
  }, [isSubmitting, shareMenuOpen]);

  if (!open) return null;

  return (
    <div className="zap-modal-overlay">
      <div className="zap-modal">
        <button
          className="zap-modal-close"
          onClick={onClose}
          aria-label="Close"
          disabled={isSubmitting}
        >
          &times;
        </button>
        <h2>Zap & Share</h2>
        <div className="zap-summary">
          <div className="zap-summary-word">{word || "Your move"}</div>
          <div className="zap-summary-points">
            {points} point{points === 1 ? "" : "s"}
          </div>
          <div className="zap-summary-scores">
            <div>
              <span className="zap-summary-label">You</span>
              <span className="zap-summary-value">{myScore}</span>
            </div>
            <div>
              <span className="zap-summary-label">{opponentLabel}</span>
              <span className="zap-summary-value">{opponentScore}</span>
            </div>
          </div>
        </div>

        <div className="zap-section">
          <h3>Nudge opponent with a zap?</h3>
          {zapsDisabled ? (
            <p className="zap-hint">Gameplay zaps are disabled.</p>
          ) : !walletConnected ? (
            <div className="zap-wallet-cta">
              <p className="zap-hint">Connect a wallet to send a zap.</p>
              {onOpenWalletSettings && (
                <button
                  className="zap-btn tertiary"
                  type="button"
                  onClick={onOpenWalletSettings}
                  disabled={isSubmitting}
                >
                  Open Wallet Settings
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="zap-amounts">
                <button
                  className={`zap-amount-btn ${selectedAmount === 0 ? "active" : ""}`}
                  onClick={() => setSelectedAmount(0)}
                  type="button"
                  disabled={isSubmitting}
                >
                  No zap
                </button>
                {PRESET_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    className={`zap-amount-btn ${selectedAmount === amount ? "active" : ""}`}
                    onClick={() => setSelectedAmount(amount)}
                    type="button"
                    disabled={isSubmitting}
                  >
                    {amount}
                  </button>
                ))}
                <button
                  className={`zap-amount-btn ${selectedAmount === "custom" ? "active" : ""}`}
                  onClick={() => setSelectedAmount("custom")}
                  type="button"
                  disabled={isSubmitting}
                >
                  Custom
                </button>
              </div>
              {selectedAmount === "custom" && (
                <div className="zap-custom-row">
                  {customAmountInvalid && (
                    <span className="zap-custom-error">
                      Enter a zap amount.
                    </span>
                  )}
                  <input
                    className="zap-custom-input"
                    type="number"
                    min={1}
                    placeholder="Custom sats"
                    value={customAmount}
                    disabled={isSubmitting}
                    onChange={(event) => setCustomAmount(event.target.value)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="zap-share-stack">
          <h3>Share</h3>
          <div className="zap-share-dropdown" ref={shareMenuRef}>
            <button
              className="zap-share-trigger"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={shareMenuOpen}
              onClick={() => setShareMenuOpen((prev) => !prev)}
              disabled={isSubmitting}
            >
              <span>{shareLabel}</span>
              <span className="zap-share-caret" aria-hidden="true">
                ▾
              </span>
            </button>
            {shareMenuOpen && !isSubmitting && (
              <div className="zap-share-menu" role="listbox">
                {SHARE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={shareMode === option.value}
                    className={`zap-share-option ${shareMode === option.value ? "active" : ""}`}
                    onClick={() => {
                      setShareMode(option.value);
                      setShareMenuOpen(false);
                    }}
                    disabled={isSubmitting}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {shareMode !== "none" && (
          <div className="zap-preview">
            <div className="zap-preview-title">
              {shareMode === "private" ? "DM preview" : "Public note preview"}
            </div>
            <pre className="zap-preview-content">{sharePreviewText}</pre>
          </div>
        )}

        <div className="zap-actions">
          <label className="zap-save-setting">
            <input
              type="checkbox"
              checked={saveShareSetting}
              disabled={isSubmitting}
              onChange={() => {
                setSaveShareSetting((prev) => {
                  const next = !prev;
                  setSaveShareSettingDefault(next);
                  if (next) {
                    if (shareMode === "none") {
                      setShareToNostrDefault(false);
                    } else {
                      setShareToNostrDefault(true);
                      setShareMethodDefault(shareMode);
                    }
                  }
                  return next;
                });
              }}
            />
            <span>Save share setting</span>
          </label>
          <button
            className="zap-btn primary"
            disabled={isSubmitting}
            onClick={() => {
              if (isSubmitting) return;
              setIsSubmitting(true);
              Promise.resolve(
                onConfirm({
                  zapAmount: customAmountInvalid ? 0 : resolvedZapAmount,
                  shareMode,
                }),
              )
                .catch(() => {
                  // Errors handled by parent.
                })
                .finally(() => {
                  if (isMountedRef.current) {
                    setIsSubmitting(false);
                  }
                });
            }}
          >
            {isSubmitting ? "Sending..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ZapNudgeModal;
