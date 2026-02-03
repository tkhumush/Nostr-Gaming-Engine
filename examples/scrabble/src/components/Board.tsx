import { useState, useCallback } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  BOARD_SIZE,
  CENTER_POSITION,
  getMultiplier,
  MultiplierType,
} from "../engine/constants";
import type { TilePlacement } from "../types/game";
import Tile from "./Tile";
import "./Board.css";

interface BoardTile {
  letter: string;
  isBlank?: boolean;
}

interface BoardProps {
  board: Record<string, string | BoardTile>;
  pendingPlacements: TilePlacement[];
  selectedTileIndex: number | null;
  onPlaceTile: (x: number, y: number) => void;
  onRemoveTile: (x: number, y: number) => void;
  onMoveTile: (fromX: number, fromY: number, toX: number, toY: number) => void;
  disabled?: boolean;
  isFirstMove?: boolean;
}

function getCellClass(multiplier: MultiplierType): string {
  switch (multiplier) {
    case "DW":
      return "cell-dw";
    case "QL":
      return "cell-ql";
    case "DL":
      return "cell-dl";
    case "ZAP":
      return "cell-zap";
    default:
      return "";
  }
}

function getCellLabel(multiplier: MultiplierType): ReactNode {
  switch (multiplier) {
    case "DW":
      return "DW";
    case "QL":
      return "QL";
    case "DL":
      return "DL";
    case "ZAP":
      return (
        <img
          src="/assets/bolt-yellow.svg"
          alt=""
          className="cell-bolt"
          aria-hidden="true"
        />
      );
    default:
      return "";
  }
}

export function Board({
  board,
  pendingPlacements,
  selectedTileIndex,
  onPlaceTile,
  onRemoveTile,
  onMoveTile,
  disabled = false,
  isFirstMove = false,
}: BoardProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const boardStyle = {
    ["--board-size"]: BOARD_SIZE,
  } as CSSProperties;

  const handleDragOver = useCallback(
    (e: React.DragEvent, x: number, y: number) => {
      e.preventDefault();
      setDragOver(`${x},${y}`);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, x: number, y: number) => {
      e.preventDefault();
      setDragOver(null);
      if (disabled) return;

      const moveData = e.dataTransfer.getData("application/x-wwz-placement");
      if (moveData) {
        try {
          const parsed = JSON.parse(moveData) as { x: number; y: number };
          onMoveTile(parsed.x, parsed.y, x, y);
        } catch {
          // Fall through to place from rack
          onPlaceTile(x, y);
        }
        return;
      }

      onPlaceTile(x, y);
    },
    [disabled, onMoveTile, onPlaceTile],
  );

  const handleCellClick = useCallback(
    (x: number, y: number) => {
      if (disabled) return;

      // Check if this cell has a pending placement - tap to remove
      const pending = pendingPlacements.find((p) => p.x === x && p.y === y);
      if (pending) {
        onRemoveTile(x, y);
        return;
      }

      // Check if cell already has a permanent tile
      const coord = `${x},${y}`;
      if (board[coord]) return;

      // If a tile is selected on the rack, place it here (tap-to-place)
      if (selectedTileIndex !== null) {
        onPlaceTile(x, y);
      }
    },
    [
      disabled,
      pendingPlacements,
      board,
      selectedTileIndex,
      onRemoveTile,
      onPlaceTile,
    ],
  );

  const handlePendingDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, placement: TilePlacement) => {
      if (disabled) return;
      e.dataTransfer.setData(
        "application/x-wwz-placement",
        JSON.stringify({ x: placement.x, y: placement.y }),
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [disabled],
  );

  const renderCell = (x: number, y: number) => {
    const coord = `${x},${y}`;
    const multiplier = getMultiplier(x, y);
    const tile = board[coord];
    const pending = pendingPlacements.find((p) => p.x === x && p.y === y);
    const isDraggedOver = dragOver === coord;
    // Show tap target indicator when a tile is selected and cell is empty
    const isTapTarget =
      selectedTileIndex !== null && !tile && !pending && !disabled;

    // Extract letter and isBlank from tile (handles both string and BoardTile)
    let letter: string | undefined;
    let isPlacedBlank = false;
    if (tile) {
      if (typeof tile === "string") {
        // Legacy: old blanks were stored as "BLANK" string
        if (tile === "BLANK") {
          letter = "?"; // Show ? for legacy blanks where we don't know the letter
          isPlacedBlank = true;
        } else {
          letter = tile;
        }
      } else {
        letter = tile.letter;
        isPlacedBlank = tile.isBlank || false;
      }
    }

    return (
      <div
        key={coord}
        className={`board-cell ${getCellClass(multiplier)} ${x === CENTER_POSITION.x && y === CENTER_POSITION.y ? "cell-center" : ""} ${x === CENTER_POSITION.x && y === CENTER_POSITION.y && isFirstMove ? "cell-center-glow" : ""} ${isDraggedOver ? "drag-over" : ""} ${isTapTarget ? "tap-target" : ""}`}
        onDragOver={(e) => handleDragOver(e, x, y)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, x, y)}
        onClick={() => handleCellClick(x, y)}
      >
        {letter ? (
          <Tile letter={letter} isBlank={isPlacedBlank} isPlaced />
        ) : pending ? (
          <Tile
            letter={pending.letter}
            isBlank={pending.isBlank}
            onDragStart={(e) => handlePendingDragStart(e, pending)}
          />
        ) : (
          <span className="cell-label">{getCellLabel(multiplier)}</span>
        )}
      </div>
    );
  };

  const cells = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      cells.push(renderCell(x, y));
    }
  }

  return (
    <div className={`board ${disabled ? "disabled" : ""}`} style={boardStyle}>
      {cells}
    </div>
  );
}

export default Board;
