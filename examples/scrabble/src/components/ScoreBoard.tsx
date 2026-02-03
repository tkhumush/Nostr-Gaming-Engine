import { useEffect, useState } from "react";
import { TbDoorExit } from "react-icons/tb";
import { fetchProfile, type NostrProfile } from "@nostr-gaming-engine/core";
import "./ScoreBoard.css";

interface Player {
  pubkey: string;
  score: number;
  isActive: boolean;
}

interface ScoreBoardProps {
  player1: Player;
  player2: Player;
  tilesRemaining: number;
  currentUserPubkey: string;
  onShare?: () => void;
  onForfeit?: () => void;
  onShowRules?: () => void;
  onShowRelays?: () => void;
  forfeitDisabled?: boolean;
}

function truncatePubkey(pubkey: string): string {
  if (pubkey.length <= 10) return pubkey;
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}

export function ScoreBoard({
  player1,
  player2,
  tilesRemaining,
  currentUserPubkey,
  onShare,
  onForfeit,
  onShowRules,
  onShowRelays,
  forfeitDisabled = false,
}: ScoreBoardProps) {
  const [profiles, setProfiles] = useState<Record<string, NostrProfile | null>>(
    {},
  );

  useEffect(() => {
    const pubkeys = [player1.pubkey, player2.pubkey];
    pubkeys.forEach(async (pubkey) => {
      if (profiles[pubkey] !== undefined) return;
      try {
        const profile = await fetchProfile(pubkey);
        setProfiles((prev) => ({ ...prev, [pubkey]: profile }));
      } catch {
        setProfiles((prev) => ({ ...prev, [pubkey]: null }));
      }
    });
  }, [player1.pubkey, player2.pubkey, profiles]);

  const getDisplayName = (pubkey: string) => {
    if (pubkey === currentUserPubkey) return "You";
    const profile = profiles[pubkey];
    return profile?.displayName || profile?.name || truncatePubkey(pubkey);
  };

  const isMyTurn =
    (player1.isActive && player1.pubkey === currentUserPubkey) ||
    (player2.isActive && player2.pubkey === currentUserPubkey);

  return (
    <div className="scoreboard">
      {/* Row 1: Scores */}
      <div className="scoreboard-scores">
        <div className={`player-score ${player1.isActive ? "active" : ""}`}>
          <span className="player-name">{getDisplayName(player1.pubkey)}</span>
          <span className="player-points">{player1.score}</span>
        </div>

        {/* Tiles in center - desktop only, hidden on mobile */}
        <div className="tiles-remaining tiles-desktop" title="Tiles in bag">
          <svg
            className="tiles-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span className="tiles-count">{tilesRemaining}</span>
        </div>

        <div className={`player-score ${player2.isActive ? "active" : ""}`}>
          <span className="player-name">{getDisplayName(player2.pubkey)}</span>
          <span className="player-points">{player2.score}</span>
        </div>

        {/* Actions - desktop only */}
        <div className="scoreboard-actions actions-desktop">
          {onShowRules && (
            <button
              className="rules-btn"
              onClick={onShowRules}
              title="Game rules"
            >
              <svg
                className="rules-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <line x1="9" y1="7" x2="16" y2="7" />
                <line x1="9" y1="11" x2="16" y2="11" />
                <line x1="9" y1="15" x2="13" y2="15" />
              </svg>
            </button>
          )}
          {onShare && (
            <button
              className="share-btn"
              onClick={onShare}
              title="Copy game link"
            >
              <svg
                className="share-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          )}
          {onShowRelays && (
            <button
              className="relay-btn"
              onClick={onShowRelays}
              title="Show relays"
            >
              <svg
                className="relay-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="5" cy="12" r="3" />
                <circle cx="19" cy="5" r="3" />
                <circle cx="19" cy="19" r="3" />
                <path d="M7.5 10.5 16 6.5" />
                <path d="M7.5 13.5 16 17.5" />
              </svg>
            </button>
          )}
          {onForfeit && (
            <button
              className="forfeit-btn"
              onClick={onForfeit}
              disabled={forfeitDisabled}
              title="Forfeit game"
            >
              <TbDoorExit className="forfeit-icon" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Turn indicator + Tiles + Actions (mobile only) */}
      <div className="scoreboard-status-row">
        {isMyTurn ? (
          <span className="turn-indicator">Your turn</span>
        ) : (
          <span className="turn-indicator waiting">Waiting...</span>
        )}
        <div className="tiles-remaining tiles-mobile" title="Tiles in bag">
          <svg
            className="tiles-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span className="tiles-count">{tilesRemaining}</span>
        </div>
        <div className="scoreboard-actions actions-mobile">
          {onShowRules && (
            <button
              className="rules-btn"
              onClick={onShowRules}
              title="Game rules"
            >
              <svg
                className="rules-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <line x1="9" y1="7" x2="16" y2="7" />
                <line x1="9" y1="11" x2="16" y2="11" />
                <line x1="9" y1="15" x2="13" y2="15" />
              </svg>
            </button>
          )}
          {onShare && (
            <button
              className="share-btn"
              onClick={onShare}
              title="Copy game link"
            >
              <svg
                className="share-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          )}
          {onShowRelays && (
            <button
              className="relay-btn"
              onClick={onShowRelays}
              title="Show relays"
            >
              <svg
                className="relay-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="5" cy="12" r="3" />
                <circle cx="19" cy="5" r="3" />
                <circle cx="19" cy="19" r="3" />
                <path d="M7.5 10.5 16 6.5" />
                <path d="M7.5 13.5 16 17.5" />
              </svg>
            </button>
          )}
          {onForfeit && (
            <button
              className="forfeit-btn"
              onClick={onForfeit}
              disabled={forfeitDisabled}
              title="Forfeit game"
            >
              <TbDoorExit className="forfeit-icon" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ScoreBoard;
