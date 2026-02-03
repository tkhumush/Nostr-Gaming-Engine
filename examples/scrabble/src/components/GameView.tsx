import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { TilePlacement } from "../types/game";
import { useGame } from "../hooks/useGame";
import {
  useWallet,
  getCurrentUser,
  createEvent,
  publishEvent,
  getDisableGameplayZaps,
  subscribeAppSettings,
  fetchProfile,
  encryptDirectMessage,
} from "@nostr-gaming-engine/core";
import Board from "./Board";
import Rack from "./Rack";
import ScoreBoard from "./ScoreBoard";
import GameControls from "./GameControls";
import BlankTilePicker from "./BlankTilePicker";
import ExchangeTilesModal from "./ExchangeTilesModal";
import { BINGO_BONUS, RACK_SIZE, shuffleArray } from "../engine/constants";
import ZapNudgeModal from "./ZapNudgeModal";
import GameOverModal from "./GameOverModal";
import AchievementModal from "./AchievementModal";
import GameRulesModal from "./GameRulesModal";
import Modal from "./Modal";
import ZapAnimation from "./ZapAnimation";
import { detectAchievement, type Achievement } from "../utils/achievements";
import { nip19 } from "nostr-tools";
import "./GameView.css";

interface GameViewProps {
  gameId: string;
  opponentPubkey: string;
  onShareGame?: (copyFn: () => void) => void;
  onToast?: (message: string, tone?: "success" | "error" | "info") => void;
  onOpenCreatorZap?: (onReturn?: () => void) => void;
  onOpenWalletSettings?: () => void;
  onOpenRelayList?: () => void;
}

type WordScorePop = {
  id: number;
  points: number;
};

const WORD_SCORE_POP_DURATION_MS = 900;
const POST_MOVE_MODAL_DELAY_MS = 1000;
export function GameView({
  gameId,
  opponentPubkey,
  onShareGame: _onShareGame,
  onToast,
  onOpenCreatorZap,
  onOpenWalletSettings,
  onOpenRelayList,
}: GameViewProps) {
  void _onShareGame; // Reserved for share UI
  const {
    gameState,
    playerRack,
    isMyTurn,
    isLoading,
    error,
    loadGame,
    makeMove,
    pass,
    exchange,
    validateMove,
    resign,
    deleteGame,
  } = useGame();

  const [pendingPlacements, setPendingPlacements] = useState<TilePlacement[]>(
    [],
  );
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(
    null,
  );
  const [localRack, setLocalRack] = useState<string[]>([]);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeSelection, setExchangeSelection] = useState<number[]>([]);
  const [shuffleCount, setShuffleCount] = useState(0);
  const [pendingBlankPosition, setPendingBlankPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [zapsDisabled, setZapsDisabled] = useState(() =>
    getDisableGameplayZaps(),
  );
  const [showZapModal, setShowZapModal] = useState(false);
  const [pendingMoveSummary, setPendingMoveSummary] = useState<{
    word: string;
    points: number;
    myScore: number;
    opponentScore: number;
    isFirstMove: boolean;
    kind: "move" | "skip";
  } | null>(null);
  const [opponentDisplayName, setOpponentDisplayName] = useState<string | null>(
    null,
  );
  const [confirmAction, setConfirmAction] = useState<
    "forfeit" | "delete" | "pass" | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [pendingAchievement, setPendingAchievement] =
    useState<Achievement | null>(null);
  const [showBingoCelebration, setShowBingoCelebration] = useState(false);
  const [wordScorePop, setWordScorePop] = useState<WordScorePop | null>(null);
  const [showZapAnimation, setShowZapAnimation] = useState(false);
  const lastValidationErrorRef = useRef<string | null>(null);
  const lastAchievementTurnRef = useRef<number | null>(null);
  const wordScoreTimeoutRef = useRef<number | null>(null);
  const postMoveModalTimeoutRef = useRef<number | null>(null);
  const bingoTimeoutRef = useRef<number | null>(null);

  const opponentLabel = opponentDisplayName || "Opponent";
  const opponentNpub = useMemo(() => {
    if (!opponentPubkey) return "";
    try {
      return nip19.npubEncode(opponentPubkey);
    } catch {
      return opponentPubkey;
    }
  }, [opponentPubkey]);

  const user = getCurrentUser();
  const myPubkey = user?.pubkey || "";
  const isCreator = gameState?.meta.playerOne === myPubkey;
  const { zapUser, state: walletState, bitcoinConnectConnected } = useWallet();
  const isWalletConnected = walletState.connected || bitcoinConnectConnected;

  useEffect(() => {
    const unsubscribe = subscribeAppSettings(() => {
      setZapsDisabled(getDisableGameplayZaps());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!opponentPubkey) {
      setOpponentDisplayName(null);
      return;
    }
    fetchProfile(opponentPubkey)
      .then((profile) => {
        if (cancelled) return;
        setOpponentDisplayName(profile?.displayName || profile?.name || null);
      })
      .catch(() => {
        if (!cancelled) {
          setOpponentDisplayName(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [opponentPubkey]);

  const gameLink = useMemo(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("gameId", gameId);
    return url.toString();
  }, [gameId]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("gameId", gameId);
    window.history.replaceState({}, "", url.toString());
  }, [gameId]);

  useEffect(() => {
    if (!gameState) return;
    const ended =
      gameState.meta.status === "completed" ||
      gameState.meta.status === "abandoned";
    if (ended) {
      setShowGameOverModal(true);
    }
  }, [gameState?.meta.status, gameId]);

  useEffect(() => {
    return () => {
      if (wordScoreTimeoutRef.current !== null) {
        window.clearTimeout(wordScoreTimeoutRef.current);
      }
      if (postMoveModalTimeoutRef.current !== null) {
        window.clearTimeout(postMoveModalTimeoutRef.current);
      }
      if (bingoTimeoutRef.current !== null) {
        window.clearTimeout(bingoTimeoutRef.current);
      }
    };
  }, []);

  // Sync local rack with latest playerRack.
  // Only refresh when it's our turn, except for initial load.
  useEffect(() => {
    if (playerRack.length === 0) return;
    const isInitialLoad = localRack.length === 0;
    if (!isInitialLoad && !isMyTurn) return;
    const sameLength = playerRack.length === localRack.length;
    // Compare tile contents (sorted) rather than order to preserve shuffle
    const sameTiles =
      sameLength &&
      [...playerRack].sort().join(",") === [...localRack].sort().join(",");
    if (!sameTiles) {
      setLocalRack(playerRack);
    }
  }, [playerRack, localRack, isMyTurn]);

  // Detect opponent's achievement when our turn begins
  useEffect(() => {
    if (!gameState || !isMyTurn) return;

    const currentTurnIndex = gameState.turn.index;
    if (lastAchievementTurnRef.current === currentTurnIndex) return;
    lastAchievementTurnRef.current = currentTurnIndex;

    if (currentTurnIndex === 0) return;

    const history = gameState.scoring.history;
    const lastMove = history[history.length - 1];

    // Check if the last move was by the opponent
    if (
      lastMove &&
      lastMove.player !== myPubkey &&
      lastMove.coords.length > 0
    ) {
      const achievement = detectAchievement(
        lastMove.word,
        lastMove.score,
        lastMove.coords,
      );
      if (achievement) {
        setPendingAchievement(achievement);
      }
    }
  }, [gameState, isMyTurn, myPubkey]);

  // Load game on mount
  useMemo(() => {
    if (gameId && opponentPubkey && !gameState) {
      loadGame(gameId, opponentPubkey);
    }
  }, [gameId, opponentPubkey, gameState, loadGame]);

  // Available tiles in rack (excluding placed ones)
  const availableRack = useMemo(() => {
    const used = pendingPlacements.map((p) => (p.isBlank ? "BLANK" : p.letter));
    const rack = [...localRack];
    for (const letter of used) {
      const idx = rack.indexOf(letter);
      if (idx !== -1) rack.splice(idx, 1);
    }
    return rack;
  }, [localRack, pendingPlacements]);

  // Validate current pending move
  const validation = useMemo(() => {
    if (pendingPlacements.length === 0) return null;
    return validateMove(pendingPlacements);
  }, [pendingPlacements, validateMove]);

  const handlePlaceTile = useCallback(
    (x: number, y: number) => {
      if (selectedTileIndex === null) return;
      if (!isMyTurn) return;

      const letter = availableRack[selectedTileIndex];
      if (!letter) return;

      // Check if position is already occupied
      const existing = pendingPlacements.find((p) => p.x === x && p.y === y);
      if (existing) return;

      if (gameState?.board[`${x},${y}`]) return;

      // Handle blank tiles - show letter picker
      if (letter === "BLANK") {
        setPendingBlankPosition({ x, y });
        return;
      }

      const placement: TilePlacement = {
        letter,
        x,
        y,
        isBlank: false,
      };

      setPendingPlacements((prev) => [...prev, placement]);
      setSelectedTileIndex(null);
    },
    [
      selectedTileIndex,
      availableRack,
      isMyTurn,
      pendingPlacements,
      gameState?.board,
    ],
  );

  const handleBlankLetterSelect = useCallback(
    (letter: string) => {
      if (!pendingBlankPosition) return;

      const placement: TilePlacement = {
        letter,
        x: pendingBlankPosition.x,
        y: pendingBlankPosition.y,
        isBlank: true,
      };

      setPendingPlacements((prev) => [...prev, placement]);
      setPendingBlankPosition(null);
      setSelectedTileIndex(null);
    },
    [pendingBlankPosition],
  );

  const handleBlankPickerCancel = useCallback(() => {
    setPendingBlankPosition(null);
  }, []);

  const handleRemoveTile = useCallback((x: number, y: number) => {
    setPendingPlacements((prev) => prev.filter((p) => p.x !== x || p.y !== y));
  }, []);

  const handleMoveTile = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number) => {
      if (!isMyTurn) return;
      if (fromX === toX && fromY === toY) return;
      if (gameState?.board[`${toX},${toY}`]) return;

      setPendingPlacements((prev) => {
        const movingIndex = prev.findIndex(
          (p) => p.x === fromX && p.y === fromY,
        );
        if (movingIndex === -1) return prev;
        if (prev.some((p) => p.x === toX && p.y === toY)) return prev;

        const next = [...prev];
        next[movingIndex] = { ...next[movingIndex], x: toX, y: toY };
        return next;
      });
    },
    [gameState?.board, isMyTurn],
  );

  const triggerWordScorePop = useCallback((points: number) => {
    if (points <= 0) return;

    if (wordScoreTimeoutRef.current !== null) {
      window.clearTimeout(wordScoreTimeoutRef.current);
    }

    setWordScorePop({
      id: Date.now(),
      points,
    });

    wordScoreTimeoutRef.current = window.setTimeout(() => {
      setWordScorePop(null);
      wordScoreTimeoutRef.current = null;
    }, WORD_SCORE_POP_DURATION_MS);
  }, []);

  const triggerZapAnimation = useCallback(() => {
    setShowZapAnimation(true);
  }, []);

  const handleZapAnimationComplete = useCallback(() => {
    setShowZapAnimation(false);
  }, []);

  const handlePlay = useCallback(async () => {
    if (!validation?.valid) return;

    const mainWord = validation.words?.[0] || "Your move";
    const points = validation.score ?? 0;
    const p1Score = gameState?.scoring.p1Score || 0;
    const p2Score = gameState?.scoring.p2Score || 0;
    const isPlayerOne = gameState?.meta.playerOne === myPubkey;
    const myScore = isPlayerOne ? p1Score + points : p2Score + points;
    const opponentScore = isPlayerOne ? p2Score : p1Score;
    const isFirstMove = (gameState?.turn.index ?? 0) === 0;
    const moveSummary = {
      word: mainWord,
      points,
      myScore,
      opponentScore,
      isFirstMove,
      kind: "move" as const,
    };

    const wasBingo = pendingPlacements.length === 7;

    const result = await makeMove(pendingPlacements);
    if (result.valid) {
      const remainingTiles = availableRack;
      setPendingPlacements([]);
      setLocalRack(remainingTiles);

      // Show bingo celebration if all 7 tiles were played
      if (wasBingo) {
        setShowBingoCelebration(true);
        if (bingoTimeoutRef.current !== null) {
          window.clearTimeout(bingoTimeoutRef.current);
        }
        bingoTimeoutRef.current = window.setTimeout(() => {
          setShowBingoCelebration(false);
          bingoTimeoutRef.current = null;
        }, 2500);
      }

      triggerWordScorePop(points);

      setPendingMoveSummary(moveSummary);
      if (postMoveModalTimeoutRef.current !== null) {
        window.clearTimeout(postMoveModalTimeoutRef.current);
      }
      postMoveModalTimeoutRef.current = window.setTimeout(() => {
        setShowZapModal(true);
        postMoveModalTimeoutRef.current = null;
      }, POST_MOVE_MODAL_DELAY_MS);
    }
  }, [
    availableRack,
    gameState?.meta.playerOne,
    gameState?.scoring.p1Score,
    gameState?.scoring.p2Score,
    makeMove,
    myPubkey,
    pendingPlacements,
    triggerWordScorePop,
    validation,
  ]);

  const handleConfirmPlay = useCallback(
    async (options: {
      zapAmount: number;
      shareMode: "none" | "public" | "private";
    }) => {
      const word = pendingMoveSummary?.word || "Your move";
      const points = pendingMoveSummary?.points ?? 0;

      if (!zapsDisabled && options.zapAmount > 0) {
        if (isWalletConnected && opponentPubkey) {
          try {
            const message = "It's your turn on #WordsWithZaps!";
            await zapUser({
              recipientPubkey: opponentPubkey,
              amountSats: options.zapAmount,
              gameId,
              moveDescription: message,
            });
            triggerZapAnimation();
            onToast?.(
              `Sent ${options.zapAmount} sat${
                options.zapAmount === 1 ? "" : "s"
              }!`,
              "success",
            );
          } catch (err) {
            console.warn("Zap failed:", err);
            const errorMsg = err instanceof Error ? err.message : String(err);
            onToast?.(`Zap failed: ${errorMsg}`, "error");
          }
        } else if (!isWalletConnected) {
          console.log("Wallet not ready, skipping zap");
        }
      } else if (zapsDisabled) {
        console.log("[Zap] Gameplay zaps disabled");
      }

      if (options.shareMode !== "none") {
        try {
          let shareText = "";
          if (pendingMoveSummary?.kind === "skip") {
            let opponentRef = "";
            if (opponentPubkey) {
              try {
                opponentRef = `nostr:${opponentNpub}`;
              } catch {
                opponentRef = opponentPubkey;
              }
            }
            const turnLine = opponentRef
              ? `It's your turn, ${opponentRef}!`
              : "It's your turn!";
            shareText = `I just completed my turn in #WordsWithZaps.\n\n${turnLine}\n\n${gameLink}`;
          } else if (pendingMoveSummary?.isFirstMove) {
            const challengeTarget =
              options.shareMode === "public"
                ? opponentLabel
                  ? `@${opponentLabel}`
                  : "you"
                : "you";
            const joinLine =
              options.shareMode === "public"
                ? "Join or start a new game here:"
                : "Join the game here:";
            shareText = `I'm challenging ${challengeTarget} to play #WordsWithZaps.\n\nI just played ${word} for ${points} point${points === 1 ? "" : "s"}.\n\n${joinLine}\n\n${gameLink}`;
          } else {
            let opponentRef = "";
            if (opponentPubkey) {
              try {
                opponentRef = `nostr:${opponentNpub}`;
              } catch {
                opponentRef = opponentPubkey;
              }
            }
            const turnLine = opponentRef
              ? `It's your turn, ${opponentRef}!`
              : "It's your turn!";
            shareText = `I just played ${word} for ${points} points in #WordsWithZaps.\n\n${turnLine}\n\n${gameLink}`;
          }

          if (options.shareMode === "public") {
            const event = createEvent(1, shareText, [
              ["t", "wordswithzaps"],
              ...(opponentPubkey ? [["p", opponentPubkey]] : []),
            ]);
            await publishEvent(event);
            onToast?.("Shared publicly!", "success");
          } else if (options.shareMode === "private") {
            if (!opponentPubkey) {
              throw new Error("Opponent pubkey not available for DM.");
            }
            const encrypted = await encryptDirectMessage(
              opponentPubkey,
              shareText,
            );
            const event = createEvent(4, encrypted, [["p", opponentPubkey]]);
            await publishEvent(event);
            onToast?.("Shared directly!", "success");
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          onToast?.(`Sharing failed: ${errorMsg}`, "error");
        }
      }

      setShowZapModal(false);
      setPendingMoveSummary(null);
    },
    [
      gameId,
      gameLink,
      onToast,
      opponentLabel,
      opponentNpub,
      opponentPubkey,
      pendingMoveSummary?.isFirstMove,
      pendingMoveSummary?.points,
      pendingMoveSummary?.word,
      triggerZapAnimation,
      isWalletConnected,
      zapUser,
      zapsDisabled,
    ],
  );

  const handlePass = useCallback(() => {
    setConfirmAction("pass");
  }, []);

  const handleClear = useCallback(() => {
    setPendingPlacements([]);
    setSelectedTileIndex(null);
  }, []);

  const handleShuffle = useCallback(() => {
    setShuffleCount((c) => c + 1);
    setLocalRack((prev) => shuffleArray(prev));
  }, []);

  const sharePreviewText = useMemo(() => {
    if (!pendingMoveSummary) {
      return { public: "", private: "" };
    }
    if (pendingMoveSummary.kind === "skip") {
      const publicTurnLine = opponentLabel
        ? `It's your turn, @${opponentLabel}!`
        : "It's your turn!";
      const privateTurnLine = "It's your turn!";
      return {
        public: `I just completed my turn in #WordsWithZaps.\n\n${publicTurnLine}\n\n${gameLink}`,
        private: `I just completed my turn in #WordsWithZaps.\n\n${privateTurnLine}\n\n${gameLink}`,
      };
    }
    const points = pendingMoveSummary.points;
    if (pendingMoveSummary.isFirstMove) {
      const publicTarget = opponentLabel ? `@${opponentLabel}` : "you";
      return {
        public: `I'm challenging ${publicTarget} to play #WordsWithZaps.\n\nI just played ${pendingMoveSummary.word} for ${points} point${points === 1 ? "" : "s"}.\n\nJoin or start a new game here:\n\n${gameLink}`,
        private: `I'm challenging you to play #WordsWithZaps.\n\nI just played ${pendingMoveSummary.word} for ${points} point${points === 1 ? "" : "s"}.\n\nJoin the game here:\n\n${gameLink}`,
      };
    }
    const turnLine = opponentLabel
      ? `It's your turn, ${opponentLabel}!`
      : "It's your turn!";
    const standard = `I just played ${pendingMoveSummary.word} for ${pendingMoveSummary.points} points in #WordsWithZaps.\n\n${turnLine}\n\n${gameLink}`;
    return { public: standard, private: standard };
  }, [gameLink, opponentLabel, pendingMoveSummary]);

  const handleExchange = useCallback(() => {
    // Enter exchange mode - clear any pending placements first
    setPendingPlacements([]);
    setSelectedTileIndex(null);
    setExchangeMode(true);
    setExchangeSelection([]);
  }, []);

  const handleToggleExchangeSelect = useCallback((index: number) => {
    setExchangeSelection((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      }
      // Limit to rack size
      if (prev.length >= RACK_SIZE) return prev;
      return [...prev, index];
    });
  }, []);

  const handleCancelExchange = useCallback(() => {
    setExchangeMode(false);
    setExchangeSelection([]);
  }, []);

  const handleConfirmExchange = useCallback(async () => {
    if (exchangeSelection.length === 0) return;

    const tilesToExchange = exchangeSelection.map((idx) => availableRack[idx]);

    try {
      await exchange(tilesToExchange);
      onToast?.(
        `Exchanged ${tilesToExchange.length} tile${tilesToExchange.length === 1 ? "" : "s"}`,
        "success",
      );
      setPendingMoveSummary({
        word: "Turn completed",
        points: 0,
        myScore: gameState?.scoring.p1Score || 0,
        opponentScore: gameState?.scoring.p2Score || 0,
        isFirstMove: false,
        kind: "skip",
      });
      setShowZapModal(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Exchange failed";
      onToast?.(message, "error");
    }

    setExchangeMode(false);
    setExchangeSelection([]);
  }, [exchangeSelection, availableRack, exchange, onToast, gameState]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(gameLink);
      onToast?.("Link copied!", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to copy game link";
      onToast?.(message, "error");
    }
  }, [gameLink, onToast]);

  const handleSendGgZap = useCallback(
    async (amount: number) => {
      if (!isWalletConnected || !opponentPubkey) return;
      try {
        const message = `Words With Zaps: GG! ${gameLink}`;
        await zapUser({
          recipientPubkey: opponentPubkey,
          amountSats: amount,
          gameId,
          moveDescription: message,
        });
        triggerZapAnimation();
        onToast?.(`Sent ${amount} sat${amount === 1 ? "" : "s"}!`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Zap failed";
        onToast?.(`GG zap failed: ${message}`, "error");
        throw err;
      }
    },
    [
      gameId,
      gameLink,
      onToast,
      opponentPubkey,
      triggerZapAnimation,
      isWalletConnected,
      zapUser,
    ],
  );

  const handleAchievementZap = useCallback(
    async (amount: number, message: string) => {
      if (!isWalletConnected || !opponentPubkey || !pendingAchievement) return;
      try {
        await zapUser({
          recipientPubkey: opponentPubkey,
          amountSats: amount,
          gameId,
          moveDescription: message,
        });
        triggerZapAnimation();
        onToast?.(`Sent ${amount} sat${amount === 1 ? "" : "s"}!`, "success");
        setPendingAchievement(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Zap failed";
        onToast?.(`Zap failed: ${message}`, "error");
      }
    },
    [
      gameId,
      onToast,
      opponentPubkey,
      pendingAchievement,
      triggerZapAnimation,
      isWalletConnected,
      zapUser,
    ],
  );

  const handleForfeit = useCallback(() => {
    setConfirmAction("forfeit");
  }, []);

  const handleDeleteGame = useCallback(() => {
    if (!isCreator) return;
    setConfirmAction("delete");
  }, [isCreator]);

  const confirmConfig = useMemo(() => {
    if (confirmAction === "forfeit") {
      return {
        title: "Forfeit game?",
        message: "You will lose and the game will end.",
        confirmLabel: "Forfeit game",
        tone: "danger",
        showCancel: true,
      };
    }
    if (confirmAction === "pass") {
      return {
        title: "Pass your turn?",
        message: "You'll skip this turn and your opponent can play.",
        confirmLabel: "Pass turn",
        tone: "danger",
        showCancel: true,
      };
    }
    if (confirmAction === "delete") {
      return {
        title: "Delete game?",
        message: "This will mark the game as deleted for both players.",
        confirmLabel: "Delete game",
        tone: "danger",
        showCancel: true,
      };
    }
    return null;
  }, [confirmAction]);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      if (confirmAction === "forfeit") {
        await resign();
        onToast?.("Game forfeited.", "info");
      }
      if (confirmAction === "pass") {
        await pass();
        setPendingPlacements([]);
        setPendingMoveSummary({
          word: "Turn completed",
          points: 0,
          myScore: gameState?.scoring.p1Score || 0,
          opponentScore: gameState?.scoring.p2Score || 0,
          isFirstMove: false,
          kind: "skip",
        });
        setShowZapModal(true);
      }
      if (confirmAction === "delete") {
        await deleteGame();
      }
      setConfirmAction(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Action failed. Try again.";
      onToast?.(message, "error");
    } finally {
      setConfirmBusy(false);
    }
  }, [confirmAction, deleteGame, onToast, resign, pass, gameState]);

  const handleCloseConfirm = useCallback(() => {
    if (confirmBusy) return;
    setConfirmAction(null);
  }, [confirmBusy]);

  useEffect(() => {
    if (!error) return;
    onToast?.(error, "error");
  }, [error, onToast]);

  useEffect(() => {
    const shouldShow =
      isMyTurn &&
      pendingPlacements.length > 0 &&
      validation &&
      !validation.valid;
    const currentError = shouldShow ? validation?.error || "Invalid move" : "";
    if (currentError && currentError !== lastValidationErrorRef.current) {
      onToast?.(currentError, "error");
      lastValidationErrorRef.current = currentError;
    } else if (!currentError) {
      lastValidationErrorRef.current = null;
    }
  }, [isMyTurn, pendingPlacements.length, validation, onToast]);
  void handleDeleteGame; // Reserved for delete button UI

  if (!gameState) {
    return (
      <div className="game-view loading">
        <p>Loading game...</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const _isPlayerOne = gameState.meta.playerOne === myPubkey;
  void _isPlayerOne; // Reserved for future use

  return (
    <div className="game-view">
      <div className="game-header">
        <ScoreBoard
          player1={{
            pubkey: gameState.meta.playerOne,
            score: gameState.scoring.p1Score,
            isActive: gameState.turn.activePlayer === gameState.meta.playerOne,
          }}
          player2={{
            pubkey: gameState.meta.playerTwo,
            score: gameState.scoring.p2Score,
            isActive: gameState.turn.activePlayer === gameState.meta.playerTwo,
          }}
          tilesRemaining={gameState.tileBag.length}
          currentUserPubkey={myPubkey}
          onShare={handleCopyLink}
          onShowRules={() => setShowRulesModal(true)}
          onShowRelays={onOpenRelayList}
          onForfeit={
            gameState.meta.status === "active" ? handleForfeit : undefined
          }
          forfeitDisabled={isLoading}
        />

        {gameState.meta.status !== "active" && (
          <div className="game-status">
            {gameState.meta.status === "completed" ? (
              <span className="status-completed">
                Game Over! Winner:{" "}
                {gameState.meta.winner === myPubkey ? "You!" : "Opponent"}
              </span>
            ) : gameState.meta.status === "abandoned" ? (
              <span className="status-abandoned">Game Abandoned</span>
            ) : gameState.meta.status === "deleted" ? (
              <span className="status-deleted">
                Game Deleted{" "}
                {gameState.meta.deletedBy
                  ? gameState.meta.deletedBy === myPubkey
                    ? "(by you)"
                    : "(by opponent)"
                  : ""}
              </span>
            ) : null}
          </div>
        )}
      </div>

      <Board
        board={gameState.board}
        pendingPlacements={pendingPlacements}
        selectedTileIndex={selectedTileIndex}
        onPlaceTile={handlePlaceTile}
        onRemoveTile={handleRemoveTile}
        onMoveTile={handleMoveTile}
        disabled={!isMyTurn || gameState.meta.status !== "active"}
        isFirstMove={(gameState.turn.index ?? 0) === 0}
      />

      <Rack
        tiles={availableRack}
        selectedTile={selectedTileIndex}
        onSelectTile={setSelectedTileIndex}
        onReturnTile={handleRemoveTile}
        onReorder={setLocalRack}
        disabled={!isMyTurn || gameState.meta.status !== "active"}
        shuffleKey={shuffleCount}
        exchangeMode={exchangeMode}
        exchangeSelection={exchangeSelection}
        onToggleExchangeSelect={handleToggleExchangeSelect}
      />

      <GameControls
        canPlay={validation?.valid || false}
        canPass={isMyTurn && gameState.meta.status === "active"}
        canExchange={
          isMyTurn &&
          gameState.meta.status === "active" &&
          gameState.tileBag.length >= RACK_SIZE
        }
        isLoading={isLoading}
        pendingScore={validation?.score}
        onPlay={handlePlay}
        onPass={handlePass}
        onExchange={handleExchange}
        onClear={handleClear}
        onShuffle={handleShuffle}
        scorePop={wordScorePop}
      />

      <ExchangeTilesModal
        open={exchangeMode}
        tiles={availableRack}
        exchangeSelection={exchangeSelection}
        isLoading={isLoading}
        onToggleExchangeSelect={handleToggleExchangeSelect}
        onCancel={handleCancelExchange}
        onConfirm={handleConfirmExchange}
      />

      {pendingBlankPosition && (
        <BlankTilePicker
          onSelect={handleBlankLetterSelect}
          onCancel={handleBlankPickerCancel}
        />
      )}

      {pendingMoveSummary && (
        <ZapNudgeModal
          open={showZapModal}
          word={pendingMoveSummary.word}
          points={pendingMoveSummary.points}
          myScore={pendingMoveSummary.myScore}
          opponentScore={pendingMoveSummary.opponentScore}
          opponentLabel={opponentLabel}
          walletConnected={isWalletConnected}
          zapsDisabled={zapsDisabled}
          sharePreviewTextPublic={sharePreviewText.public}
          sharePreviewTextPrivate={sharePreviewText.private}
          onConfirm={handleConfirmPlay}
          onClose={() => {
            setShowZapModal(false);
            setPendingMoveSummary(null);
          }}
          onOpenWalletSettings={onOpenWalletSettings}
        />
      )}

      {confirmConfig && (
        <Modal
          open={Boolean(confirmConfig)}
          title={confirmConfig.title}
          onClose={handleCloseConfirm}
          footer={
            <div className="wwz-modal-actions">
              {confirmConfig.showCancel && (
                <button
                  className="wwz-modal-btn"
                  type="button"
                  onClick={handleCloseConfirm}
                  disabled={confirmBusy}
                >
                  Cancel
                </button>
              )}
              <button
                className={`wwz-modal-btn ${confirmConfig.tone}`}
                type="button"
                onClick={handleConfirmAction}
                disabled={confirmBusy}
              >
                {confirmBusy ? "Working..." : confirmConfig.confirmLabel}
              </button>
            </div>
          }
        >
          <p>{confirmConfig.message}</p>
        </Modal>
      )}

      {gameState.meta.status !== "active" && (
        <GameOverModal
          open={showGameOverModal}
          opponentLabel={opponentLabel}
          walletConnected={isWalletConnected}
          onClose={() => setShowGameOverModal(false)}
          onSendZap={handleSendGgZap}
          onOpenCreatorZap={() => {
            setShowGameOverModal(false);
            onOpenCreatorZap?.(() => setShowGameOverModal(true));
          }}
        />
      )}

      {pendingAchievement && (
        <AchievementModal
          achievement={pendingAchievement}
          opponentName={opponentLabel}
          walletConnected={isWalletConnected}
          onZap={handleAchievementZap}
          onClose={() => setPendingAchievement(null)}
          onOpenWalletSettings={onOpenWalletSettings}
        />
      )}

      {showBingoCelebration && (
        <div className="zapathon-celebration">
          <div className="zapathon-confetti">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="confetti-piece"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${2 + Math.random() * 1}s`,
                }}
              />
            ))}
          </div>
          <div className="zapathon-celebration-content">
            <div className="zapathon-text">ZAPATHON!</div>
            <div className="zapathon-subtext">
              All {RACK_SIZE} tiles played!
            </div>
            <div className="zapathon-bonus">+{BINGO_BONUS} bonus points</div>
          </div>
        </div>
      )}

      <GameRulesModal
        open={showRulesModal}
        onClose={() => setShowRulesModal(false)}
      />

      {showZapAnimation && (
        <ZapAnimation onComplete={handleZapAnimationComplete} />
      )}
    </div>
  );
}

export default GameView;
