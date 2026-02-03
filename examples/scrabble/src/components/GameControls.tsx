import "./GameControls.css";

interface GameControlsProps {
  canPlay: boolean;
  canPass: boolean;
  canExchange: boolean;
  isLoading: boolean;
  pendingScore?: number;
  scorePop?: { id: number; points: number } | null;
  onPlay: () => void;
  onPass: () => void;
  onExchange: () => void;
  onClear: () => void;
  onShuffle: () => void;
}

export function GameControls({
  canPlay,
  canPass,
  canExchange,
  isLoading,
  pendingScore,
  scorePop = null,
  onPlay,
  onPass,
  onExchange,
  onClear,
  onShuffle,
}: GameControlsProps) {
  return (
    <div className="game-controls">
      <div className="controls-left">
        <button
          className="control-btn secondary"
          onClick={onShuffle}
          disabled={isLoading}
          title="Shuffle tiles in rack"
        >
          Shuffle
        </button>
        <button
          className="control-btn secondary"
          onClick={onClear}
          disabled={isLoading}
          title="Return tiles to rack"
        >
          Clear
        </button>
      </div>

      <div className="controls-center">
        {pendingScore !== undefined && pendingScore > 0 && (
          <div className="pending-score">+{pendingScore}</div>
        )}
        <div className="play-btn-wrap">
          {scorePop && (
            <span key={scorePop.id} className="play-score-pop">
              +{scorePop.points}
            </span>
          )}
          <button
            className="control-btn primary play-btn"
            onClick={onPlay}
            disabled={!canPlay || isLoading}
          >
            {isLoading ? "Playing..." : "Play Turn"}
          </button>
        </div>
      </div>

      <div className="controls-right">
        <button
          className="control-btn secondary"
          onClick={onPass}
          disabled={!canPass || isLoading}
          title="Skip your turn"
        >
          Pass
        </button>
        <button
          className="control-btn secondary"
          onClick={onExchange}
          disabled={!canExchange || isLoading}
          title="Exchange selected tiles"
        >
          Exchange
        </button>
      </div>
    </div>
  );
}

export default GameControls;
