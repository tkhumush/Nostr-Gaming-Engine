import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  getZapNudgeDefaultAmount,
  setZapNudgeDefaultAmount,
} from "@nostr-gaming-engine/core";
import Modal from "./Modal";
import "./CreatorZapModal.css";

const CREATOR_LIGHTNING_ADDRESS = "daniel@breez.tips";
const PRESET_AMOUNTS = [50, 100, 500, 1000];

interface CreatorZapModalProps {
  open: boolean;
  walletConnected: boolean;
  onClose: () => void;
  onSendZap: (amount: number) => Promise<void>;
}

export function CreatorZapModal({
  open,
  walletConnected,
  onClose,
  onSendZap,
}: CreatorZapModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | "custom" | 0>(
    getZapNudgeDefaultAmount(),
  );
  const [customAmount, setCustomAmount] = useState(() => {
    const saved = getZapNudgeDefaultAmount();
    return saved > 0 && !PRESET_AMOUNTS.includes(saved) ? String(saved) : "";
  });
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
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

  const qrValue = useMemo(() => `lightning:${CREATOR_LIGHTNING_ADDRESS}`, []);

  const handleSend = async () => {
    if (!walletConnected || customAmountInvalid || resolvedAmount <= 0) return;
    setIsSending(true);
    setError(null);
    try {
      await onSendZap(resolvedAmount);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Zap failed";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Zap the creator"
      titleClassName="title-yellow"
      onClose={onClose}
    >
      <div className="creator-zap-body">
        <div className="creator-qr">
          <QRCodeSVG
            value={qrValue}
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
        <div className="creator-address">{CREATOR_LIGHTNING_ADDRESS}</div>
        <p className="creator-hint">
          Scan the code to zap from another wallet.
        </p>

        <div className="creator-zap-inline">
          <input
            className="creator-zap-input"
            type="number"
            min={1}
            maxLength={8}
            placeholder="sats"
            value={customAmount}
            onChange={(event) => {
              const val = event.target.value.slice(0, 8);
              setCustomAmount(val);
              setSelectedAmount("custom");
            }}
          />
          <button
            className="creator-zap-btn"
            type="button"
            onClick={handleSend}
            disabled={!walletConnected || isSending || customAmountValue <= 0}
          >
            {isSending ? "Sending..." : "Zap"}
          </button>
        </div>
        {error && <p className="creator-error">{error}</p>}
        <p className="creator-hint">Send from your connected wallet.</p>
      </div>
    </Modal>
  );
}

export default CreatorZapModal;
