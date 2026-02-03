import { LETTER_VALUES } from "../engine/constants";
import "./Tile.css";

interface TileProps {
  letter: string;
  isBlank?: boolean;
  isDragging?: boolean;
  isPlaced?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
}

export function Tile({
  letter,
  isBlank = false,
  isDragging = false,
  isPlaced = false,
  onDragStart,
  onDragEnd,
}: TileProps) {
  // For unplayed blanks in rack: letter="BLANK", isBlank=true -> show empty
  // For played blanks on board: letter="P" (chosen), isBlank=true -> show "P" but 0 points
  const isUnplayedBlank = letter === "BLANK";
  const displayLetter = isUnplayedBlank ? "" : letter;
  const value = isBlank ? 0 : LETTER_VALUES[letter] || 0;
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setDragImage(event.currentTarget, 18, 18);
    onDragStart?.(event);
  };

  return (
    <div
      className={`tile ${isDragging ? "dragging" : ""} ${isPlaced ? "placed" : ""} ${isBlank ? "blank" : ""}`}
      draggable={!!onDragStart}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
    >
      <span className="tile-letter">{displayLetter}</span>
      {value > 0 && <span className="tile-value">{value}</span>}
    </div>
  );
}

export default Tile;
