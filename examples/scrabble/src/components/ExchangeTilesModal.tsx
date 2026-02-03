import Rack from "./Rack";
import Modal from "./Modal";
import "./ExchangeTilesModal.css";

interface ExchangeTilesModalProps {
  open: boolean;
  tiles: string[];
  exchangeSelection: number[];
  isLoading?: boolean;
  onToggleExchangeSelect: (index: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ExchangeTilesModal({
  open,
  tiles,
  exchangeSelection,
  isLoading = false,
  onToggleExchangeSelect,
  onCancel,
  onConfirm,
}: ExchangeTilesModalProps) {
  if (!open) return null;

  const selectionCount = exchangeSelection.length;

  return (
    <Modal open={open} title="Exchange tiles" onClose={onCancel}>
      <div className="exchange-modal-content">
        <p className="exchange-modal-hint">Select up to 7 tiles to swap.</p>
        <div className="exchange-modal-rack">
          <Rack
            tiles={tiles}
            selectedTile={null}
            onSelectTile={() => {}}
            exchangeMode
            exchangeSelection={exchangeSelection}
            onToggleExchangeSelect={onToggleExchangeSelect}
            disabled={isLoading}
          />
        </div>
        <div className="exchange-modal-count">
          {selectionCount} selected
        </div>
      </div>
      <div className="wwz-modal-actions exchange-modal-actions">
        <button
          className="wwz-modal-btn"
          type="button"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          className="wwz-modal-btn primary"
          type="button"
          onClick={onConfirm}
          disabled={selectionCount === 0 || isLoading}
        >
          {isLoading
            ? "Exchanging..."
            : `Exchange ${selectionCount} tile${selectionCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </Modal>
  );
}

export default ExchangeTilesModal;
