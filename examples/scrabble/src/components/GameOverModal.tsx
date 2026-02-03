import { useEffect, useMemo, useState } from "react";
import {
  getZapNudgeDefaultAmount,
  setZapNudgeDefaultAmount,
} from "@nostr-gaming-engine/core";
import Modal from "./Modal";
import "./GameOverModal.css";

interface GameOverModalProps {
  open: boolean;
  opponentLabel: string;
  walletConnected: boolean;
  onClose: () => void;
  onSendZap: (amount: number) => Promise<void>;
  onOpenCreatorZap: () => void;
}

const PRESET_AMOUNTS = [50, 100, 500, 1000];

export function GameOverModal({
  open,
  opponentLabel,
  walletConnected,
  onClose,
  onSendZap,
  onOpenCreatorZap,
}: GameOverModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | "custom" | 0>(
    getZapNudgeDefaultAmount(),
  );
  const [customAmount, setCustomAmount] = useState(() => {
    const saved = getZapNudgeDefaultAmount();
    return saved > 0 && !PRESET_AMOUNTS.includes(saved) ? String(saved) : "";
  });
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const saved = getZapNudgeDefaultAmount();
    setSelectedAmount(
      saved > 0 && !PRESET_AMOUNTS.includes(saved) ? "custom" : saved,
    );
    setCustomAmount(
      saved > 0 && !PRESET_AMOUNTS.includes(saved) ? String(saved) : "",
    );
    setIsSending(false);
  }, [open]);

  const customAmountValue = useMemo(() => {
    const parsed = parseInt(customAmount, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [customAmount]);

  const resolvedAmount = useMemo(() => {
    if (selectedAmount === "custom") return customAmountValue;
    return selectedAmount;
  }, [customAmountValue, selectedAmount]);

  const customAmountInvalid =
    selectedAmount === "custom" && customAmountValue <= 0;

  useEffect(() => {
    const amount =
      selectedAmount === "custom" ? customAmountValue : selectedAmount;
    if (amount >= 0) {
      setZapNudgeDefaultAmount(amount);
    }
  }, [customAmountValue, selectedAmount]);

  const handleSend = async () => {
    if (!walletConnected || customAmountInvalid || resolvedAmount <= 0) return;
    setIsSending(true);
    try {
      await onSendZap(resolvedAmount);
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      footer={
        walletConnected ? (
          <div className="wwz-modal-actions">
            <button
              className="wwz-modal-btn primary"
              type="button"
              onClick={handleSend}
              disabled={isSending || customAmountInvalid || resolvedAmount <= 0}
            >
              {isSending ? "Sending..." : "Send GG zap"}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="gameover-body">
        <img
          src="/assets/game_over.svg"
          alt="Game over"
          className="gameover-graphic"
        />
        <p className="gameover-text">
          {walletConnected
            ? `Thanks for playing! Want to send a GG zap to ${opponentLabel}?`
            : "Thanks for playing!"}
        </p>
      </div>

      {walletConnected && (
        <div className="gameover-zap">
          <div className="gameover-zap-title">GG zap amount</div>
          <div className="zap-amounts">
            <button
              className={`zap-amount-btn ${selectedAmount === 0 ? "active" : ""}`}
              onClick={() => setSelectedAmount(0)}
              type="button"
            >
              No zap
            </button>
            {PRESET_AMOUNTS.map((amount) => (
              <button
                key={amount}
                className={`zap-amount-btn ${selectedAmount === amount ? "active" : ""}`}
                onClick={() => setSelectedAmount(amount)}
                type="button"
              >
                {amount}
              </button>
            ))}
            <button
              className={`zap-amount-btn ${selectedAmount === "custom" ? "active" : ""}`}
              onClick={() => setSelectedAmount("custom")}
              type="button"
            >
              Custom
            </button>
          </div>
          {selectedAmount === "custom" && (
            <div className="zap-custom-row">
              {customAmountInvalid && (
                <span className="zap-custom-error">Enter a zap amount.</span>
              )}
              <input
                className="zap-custom-input"
                type="number"
                min={1}
                placeholder="Custom sats"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
              />
            </div>
          )}
        </div>
      )}

      <div className="gameover-creator">
        <button
          className="gameover-creator-btn"
          type="button"
          onClick={onOpenCreatorZap}
        >
          If you enjoyed this game, you can also zap the creator.
        </button>
      </div>
    </Modal>
  );
}

export default GameOverModal;
