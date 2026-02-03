import Modal from "./Modal";
import "./RelayListModal.css";

interface RelayListModalProps {
  open: boolean;
  relays: string[];
  connectedRelays?: string[];
  onClose: () => void;
}

export function RelayListModal({
  open,
  relays,
  connectedRelays = [],
  onClose,
}: RelayListModalProps) {
  const sortedRelays = [...relays].sort();
  const normalize = (relay: string) =>
    relay.trim().toLowerCase().replace(/\/+$/, "");
  const connectedSet = new Set(connectedRelays.map(normalize));
  return (
    <Modal open={open} onClose={onClose} title="Relays">
      <div className="relay-list-summary">
        {sortedRelays.length} relay{sortedRelays.length === 1 ? "" : "s"} in
        pool
      </div>
      {sortedRelays.length === 0 ? (
        <div className="relay-list-empty">No relays connected.</div>
      ) : (
        <ul className="relay-list">
          {sortedRelays.map((relay) => {
            const isConnected = connectedSet.has(normalize(relay));
            return (
              <li
                key={relay}
                className={`relay-list-item ${isConnected ? "active" : "inactive"}`}
              >
                <span
                  className="relay-status-dot"
                  aria-label={isConnected ? "Active relay" : "Inactive relay"}
                  title={isConnected ? "Active" : "Inactive"}
                />
                <span className="relay-url">{relay}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

export default RelayListModal;
