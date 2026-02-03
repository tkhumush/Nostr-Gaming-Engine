import { useEffect, useMemo, useState } from "react";
import type { Achievement } from "../utils/achievements";
import "./AchievementModal.css";

interface AchievementModalProps {
  achievement: Achievement;
  opponentName: string;
  walletConnected: boolean;
  onZap: (amount: number, message: string) => void | Promise<void>;
  onClose: () => void;
  onOpenWalletSettings?: () => void;
}

const PRESET_AMOUNTS = [21, 50, 100, 500];

const ACHIEVEMENT_ICONS: Record<Achievement["type"], string> = {
  bingo: "7",
  "zap-bonus": "⚡",
  "double-word": "2x",
  "high-score": "!",
};

const ACHIEVEMENT_ZAP_MESSAGES: Record<Achievement["type"], string> = {
  bingo: "Nice job on the Bingo! #WordsWithZaps",
  "zap-bonus": "Nice job hitting the ZAP square! #WordsWithZaps",
  "double-word": "Nice job on the Double Word Score! #WordsWithZaps",
  "high-score": "Nice job on the High Score! #WordsWithZaps",
};

export function AchievementModal({
  achievement,
  opponentName,
  walletConnected,
  onZap,
  onClose,
  onOpenWalletSettings,
}: AchievementModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | "custom">(21);
  const [customAmount, setCustomAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const defaultMessage = ACHIEVEMENT_ZAP_MESSAGES[achievement.type];
  const [zapMessage, setZapMessage] = useState(defaultMessage);

  useEffect(() => {
    setZapMessage(defaultMessage);
  }, [defaultMessage]);

  const customAmountValue = useMemo(() => {
    const parsed = parseInt(customAmount, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [customAmount]);

  const resolvedAmount = useMemo(() => {
    if (selectedAmount === "custom") return customAmountValue;
    return selectedAmount;
  }, [selectedAmount, customAmountValue]);

  const handleZap = async () => {
    if (resolvedAmount <= 0 || isSending) return;
    setIsSending(true);
    try {
      const message = zapMessage.trim() || defaultMessage;
      await onZap(resolvedAmount, message);
    } finally {
      setIsSending(false);
    }
  };

  // Format the word display (handle multiple words separated by comma)
  const displayWord = achievement.word.split(",")[0].trim().toUpperCase();
  return (
    <div className="achievement-overlay" onClick={onClose}>
      <div className="achievement-modal" onClick={(e) => e.stopPropagation()}>
        <div className="achievement-burst" />

        <div className="achievement-badge">
          <div
            className={`achievement-badge-icon ${achievement.type === "bingo" ? "bingo" : ""}`}
          >
            {ACHIEVEMENT_ICONS[achievement.type]}
          </div>
        </div>

        <p className="achievement-intro">
          <strong>{opponentName}</strong> played an amazing word!
        </p>

        <div className="achievement-word-display">
          <p className="achievement-word">{displayWord}</p>
          <p className="achievement-score">{achievement.score} points</p>
        </div>

        <p className="achievement-type">{achievement.message}</p>

        <div className="achievement-zap-section">
          <h3>Send a congratulatory zap?</h3>

          {!walletConnected ? (
            <div className="achievement-wallet-cta">
              <p className="achievement-wallet-hint">
                Connect a wallet to send zaps
              </p>
              {onOpenWalletSettings && (
                <button
                  className="achievement-btn wallet"
                  onClick={onOpenWalletSettings}
                  type="button"
                >
                  Connect Wallet
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="achievement-zap-presets">
                {PRESET_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    className={`achievement-zap-btn ${selectedAmount === amount ? "active" : ""}`}
                    onClick={() => setSelectedAmount(amount)}
                    type="button"
                    disabled={isSending}
                  >
                    {amount} sats
                  </button>
                ))}
              </div>

              <div className="achievement-custom-row">
                <input
                  className="achievement-custom-input"
                  type="number"
                  min={1}
                  placeholder="Custom amount"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setSelectedAmount("custom");
                  }}
                  onFocus={() => setSelectedAmount("custom")}
                  disabled={isSending}
                />
              </div>

              <div className="achievement-message">
                <label
                  className="achievement-message-label"
                  htmlFor="zapMessage"
                >
                  Zap message
                </label>
                <textarea
                  id="zapMessage"
                  className="achievement-message-input"
                  rows={3}
                  value={zapMessage}
                  onChange={(event) => setZapMessage(event.target.value)}
                  disabled={isSending}
                />
                <p className="achievement-message-hint">
                  This will be sent with your zap.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="achievement-actions">
          <button
            className="achievement-btn skip"
            onClick={onClose}
            disabled={isSending}
          >
            Skip
          </button>
          {walletConnected && (
            <button
              className="achievement-btn zap"
              onClick={handleZap}
              disabled={resolvedAmount <= 0 || isSending}
            >
              {isSending
                ? "Sending..."
                : `Send ${resolvedAmount > 0 ? `${resolvedAmount} sats` : "Zap"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AchievementModal;
