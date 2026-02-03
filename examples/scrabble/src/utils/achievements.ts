export type AchievementType =
  | "bingo"
  | "zap-bonus"
  | "double-word"
  | "high-score";

export interface Achievement {
  type: AchievementType;
  word: string;
  score: number;
  message: string;
}

// ZAP bonus squares on the board (+21 points)
// Excludes center (7,7) since first move always starts there
const ZAP_SQUARES = new Set(["0,0", "0,14", "14,0", "14,14"]);

// Double Word squares on the board
const DW_SQUARES = new Set([
  "7,1",
  "2,2",
  "12,2",
  "1,7",
  "13,7",
  "2,12",
  "12,12",
  "7,13",
]);

/**
 * Detect if a move qualifies as an achievement.
 * Priority order: Bingo > Triple Word > High Score (40+) > Double Word (25+)
 */
export function detectAchievement(
  word: string,
  score: number,
  coords: string[],
): Achievement | null {
  // Skip passes and exchanges
  if (word.startsWith("(")) {
    return null;
  }

  // Check bingo first (highest priority) - all 7 tiles used
  if (coords.length === 7) {
    return {
      type: "bingo",
      word,
      score,
      message: "BINGO! All 7 tiles played!",
    };
  }

  // Check for ZAP bonus - any placed tile on a ZAP square
  const hitsZap = coords.some((c) => ZAP_SQUARES.has(c));
  if (hitsZap) {
    return {
      type: "zap-bonus",
      word,
      score,
      message: "ZAP Bonus! +21 points!",
    };
  }

  // Check for high score (40+ points)
  if (score >= 40) {
    return {
      type: "high-score",
      word,
      score,
      message: `Amazing ${score} points!`,
    };
  }

  // Check for double word (25+ points required to be noteworthy)
  const hitsDW = coords.some((c) => DW_SQUARES.has(c));
  if (hitsDW && score >= 25) {
    return {
      type: "double-word",
      word,
      score,
      message: "Double Word Score!",
    };
  }

  return null;
}
