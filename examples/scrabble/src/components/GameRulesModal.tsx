import Modal from "./Modal";
import {
  BINGO_BONUS,
  RACK_SIZE,
  ZAP_BONUS_POINTS,
  TILE_DISTRIBUTION,
  LETTER_VALUES,
} from "../engine/constants";
import "./GameRulesModal.css";

interface GameRulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function GameRulesModal({ open, onClose }: GameRulesModalProps) {
  return (
    <Modal open={open} title="How to Play" onClose={onClose}>
      <div className="game-rules-content">
        <section className="rules-section">
          <h3>Objective</h3>
          <p>Score the most points by forming words on the board.</p>
        </section>

        <section className="rules-section">
          <h3>Your Turn</h3>
          <ul>
            <li>Place tiles to form a word (horizontal or vertical)</li>
            <li>
              New words must connect to existing tiles (except first move)
            </li>
            <li>
              First word must cover the center bolt (the glowing yellow square)
            </li>
          </ul>
        </section>

        <section className="rules-section">
          <h3>Scoring</h3>
          <ul>
            <li>Each letter has a point value (shown on tile)</li>
            <li>
              <span className="multiplier dl">DL</span> = Double Letter
            </li>
            <li>
              <span className="multiplier ql">QL</span> = Quad Letter
            </li>
            <li>
              <span className="multiplier dw">DW</span> = Double Word
            </li>
            <li>
              <span className="multiplier zap">ZAP</span> = +{ZAP_BONUS_POINTS}{" "}
              per word that includes a newly placed bolt tile
            </li>
            <li>
              <span className="bingo">ZAPATHON:</span> Play all {RACK_SIZE}{" "}
              tiles = +{BINGO_BONUS} bonus points
            </li>
          </ul>
        </section>

        <section className="rules-section">
          <h3>Special Moves</h3>
          <ul>
            <li>
              <strong>Pass:</strong> Skip your turn (game ends after two
              consecutive passes)
            </li>
            <li>
              <strong>Exchange:</strong> Swap 1–{RACK_SIZE} tiles with the bag
              (requires at least that many tiles in bag)
            </li>
          </ul>
        </section>

        <section className="rules-section">
          <h3>Blank Tiles</h3>
          <ul>
            <li>Worth 0 points</li>
            <li>Can represent any letter</li>
            <li>Letter is locked once played</li>
          </ul>
        </section>

        <section className="rules-section">
          <h3>Game End</h3>
          <ul>
            <li>Both players pass consecutively (2 total passes)</li>
            <li>One player uses all tiles (goes out)</li>
            <li>A player forfeits</li>
          </ul>
        </section>

        <section className="rules-section">
          <h3>Tile Distribution</h3>
          <p className="tile-dist-total">
            {Object.values(TILE_DISTRIBUTION).reduce((a, b) => a + b, 0)} tiles
            total
          </p>
          <div className="tile-distribution">
            {Object.entries(TILE_DISTRIBUTION).map(([letter, count]) => (
              <div key={letter} className="tile-dist-item">
                <span className="tile-dist-letter">
                  {letter === "BLANK" ? "?" : letter}
                </span>
                <span className="tile-dist-count">×{count}</span>
                <span className="tile-dist-points">
                  {letter === "BLANK" ? "0" : LETTER_VALUES[letter]}pt
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}

export default GameRulesModal;
