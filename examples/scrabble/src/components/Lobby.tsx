import { useState, useCallback, useEffect, useRef } from "react";
import { useGame } from "../hooks/useGame";
import {
  getCurrentUser,
  subscribeToEvents,
  fetchProfile,
  normalizePubkey,
  fetchUserGames,
  GAME_KIND,
  type GameSummary,
  type NostrProfile,
} from "@nostr-gaming-engine/core";
import { getGameLabel } from "../utils/gameLabel";
import OpponentSearch from "./OpponentSearch";
import "./Lobby.css";

interface LobbyProps {
  onGameStart: (gameId: string, opponentPubkey: string) => void;
  prefillGameId?: string | null;
  prefillError?: string | null;
}

export function Lobby({
  onGameStart,
  prefillGameId,
  prefillError,
}: LobbyProps) {
  const [opponentInput, setOpponentInput] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<NostrProfile | null>(
    null,
  );
  const [joinGameId, setJoinGameId] = useState("");
  const [joinOpponent, setJoinOpponent] = useState("");
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [showEndedGames, setShowEndedGames] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, NostrProfile | null>>(
    {},
  );
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { createGame } = useGame();
  const user = getCurrentUser();

  useEffect(() => {
    if (prefillGameId && !joinGameId) {
      setJoinGameId(prefillGameId);
      setShowJoinForm(true);
    }
    if (prefillError) {
      setError(prefillError);
    }
  }, [prefillGameId, prefillError, joinGameId]);

  const loadGames = useCallback(async () => {
    if (!user?.pubkey) return;
    setIsLoadingGames(true);
    try {
      const results = await fetchUserGames(user.pubkey);
      setGames(results);
    } catch (err) {
      console.error("Failed to load games:", err);
    } finally {
      setIsLoadingGames(false);
    }
  }, [user?.pubkey]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) return;
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null;
      loadGames();
    }, 500);
  }, [loadGames]);

  useEffect(() => {
    if (!user?.pubkey) return;

    const subscription = subscribeToEvents(
      { kinds: [GAME_KIND], "#p": [user.pubkey] },
      () => scheduleRefresh(),
    );

    const intervalId = window.setInterval(() => {
      loadGames();
    }, 30000);

    return () => {
      subscription.unsubscribe();
      window.clearInterval(intervalId);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [user?.pubkey, loadGames, scheduleRefresh]);

  useEffect(() => {
    if (!user?.pubkey) return;
    loadGames();
  }, [user?.pubkey, loadGames]);

  // Load profiles for opponents
  useEffect(() => {
    if (!user?.pubkey) return;
    const pubkeys = new Set<string>();
    for (const game of games) {
      if (game.opponentPubkey) {
        pubkeys.add(game.opponentPubkey);
      }
    }

    const missing = Array.from(pubkeys).filter(
      (pubkey) => profiles[pubkey] === undefined,
    );
    if (missing.length === 0) return;

    let cancelled = false;

    const loadProfiles = async () => {
      const results = await Promise.all(
        missing.map(async (pubkey) => {
          try {
            return await fetchProfile(pubkey);
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      setProfiles((prev) => {
        const next = { ...prev };
        missing.forEach((pubkey, index) => {
          next[pubkey] = results[index];
        });
        return next;
      });
    };

    loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [user?.pubkey, games, profiles]);

  const handleOpponentSelect = (profile: NostrProfile) => {
    setSelectedOpponent(profile);
    setError(null);
  };

  const handleCreateGame = useCallback(async () => {
    const pubkey =
      selectedOpponent?.pubkey || normalizePubkey(opponentInput) || "";
    if (!pubkey) {
      setError("Select an opponent or enter a valid npub");
      return;
    }

    if (pubkey === user?.pubkey) {
      setError("Cannot play against yourself");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const gameId = await createGame(pubkey);
      onGameStart(gameId, pubkey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setIsCreating(false);
    }
  }, [opponentInput, selectedOpponent, user?.pubkey, createGame, onGameStart]);

  const handleJoinGame = useCallback(() => {
    if (!joinGameId.trim() || !joinOpponent.trim()) {
      setError("Enter both game ID and opponent");
      return;
    }

    const pubkey = normalizePubkey(joinOpponent);
    if (!pubkey) {
      setError("Invalid opponent pubkey");
      return;
    }

    onGameStart(joinGameId.trim(), pubkey);
  }, [joinGameId, joinOpponent, onGameStart]);

  const getOpponentName = (pubkey: string) => {
    const profile = profiles[pubkey];
    return profile?.displayName || profile?.name || pubkey.slice(0, 8) + "...";
  };

  const getOpponentPicture = (pubkey: string) => profiles[pubkey]?.picture;

  const getOpponentInitial = (pubkey: string) => {
    const profile = profiles[pubkey];
    const name = profile?.displayName || profile?.name;
    return name ? name.charAt(0).toUpperCase() : pubkey.charAt(0).toUpperCase();
  };

  const isMyTurn = (game: GameSummary) => game.activePlayer === user?.pubkey;

  const isGameEnded = (game: GameSummary) =>
    game.status === "completed" ||
    game.status === "abandoned" ||
    game.status === "deleted";

  const visibleGames = showEndedGames
    ? games
    : games.filter((game) => !isGameEnded(game));

  const handleGameClick = (game: GameSummary) => {
    const opponent =
      game.opponentPubkey || game.players.find((p) => p !== user?.pubkey);
    if (opponent) {
      onGameStart(game.gameId, opponent);
    }
  };

  const getScorePreview = (game: GameSummary) => {
    if (game.p1Score === undefined || game.p2Score === undefined) return null;
    const isPlayerOne = (game.playerOne || game.creatorPubkey) === user?.pubkey;
    const myScore = isPlayerOne ? game.p1Score : game.p2Score;
    const opponentScore = isPlayerOne ? game.p2Score : game.p1Score;
    return { myScore, opponentScore };
  };

  return (
    <div className="lobby">
      {error && <div className="lobby-error">{error}</div>}

      {/* Games List */}
      <div className="games-section">
        <div className="games-header">
          <h2>Your Games</h2>
          <div className="games-header-actions">
            <button
              className={`text-btn ${showEndedGames ? "active" : ""}`}
              onClick={() => setShowEndedGames((prev) => !prev)}
            >
              {showEndedGames ? "Hide ended" : "Show ended"}
            </button>
            <button
              className="text-btn"
              onClick={loadGames}
              disabled={isLoadingGames}
            >
              {isLoadingGames ? "..." : "Refresh"}
            </button>
          </div>
        </div>

        {visibleGames.length === 0 ? (
          <div className="games-empty">
            {isLoadingGames
              ? "Loading..."
              : games.length === 0
                ? "No games yet"
                : "No active games"}
          </div>
        ) : (
          <div className="games-list">
            {visibleGames.map((game) => {
              const opponentPubkey =
                game.opponentPubkey ||
                game.players.find((p) => p !== user?.pubkey) ||
                "";
              const ended = isGameEnded(game);
              const myTurn = isMyTurn(game);
              const scorePreview = getScorePreview(game);

              return (
                <div
                  key={game.gameId}
                  className={`game-card ${ended ? "ended" : ""} ${myTurn && !ended ? "my-turn" : ""}`}
                  onClick={() => handleGameClick(game)}
                >
                  <div className="opponent-avatar-wrapper">
                    {opponentPubkey && getOpponentPicture(opponentPubkey) ? (
                      <img
                        src={getOpponentPicture(opponentPubkey)}
                        alt=""
                        className="opponent-avatar"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          const fallback = (e.target as HTMLImageElement)
                            .nextElementSibling;
                          if (fallback)
                            (fallback as HTMLElement).style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div
                      className="opponent-avatar fallback"
                      style={{
                        display:
                          opponentPubkey && getOpponentPicture(opponentPubkey)
                            ? "none"
                            : "flex",
                      }}
                    >
                      {opponentPubkey
                        ? getOpponentInitial(opponentPubkey)
                        : "?"}
                    </div>
                  </div>

                  <div className="game-info">
                    <div className="game-top-row">
                      <span className="opponent-name">
                        {opponentPubkey
                          ? getOpponentName(opponentPubkey)
                          : "Unknown"}
                      </span>
                      {!ended && (
                        <span
                          className={`turn-badge ${myTurn ? "your-turn" : "their-turn"}`}
                        >
                          {myTurn ? "Your turn" : "Waiting"}
                        </span>
                      )}
                    </div>
                    <div className="game-subtext">
                      <span className="game-name">
                        {getGameLabel(game.gameId)}
                      </span>
                      {scorePreview && (
                        <span className="game-score">
                          {scorePreview.myScore} – {scorePreview.opponentScore}
                        </span>
                      )}
                    </div>
                  </div>

                  {ended && (
                    <span className={`game-status ${game.status}`}>
                      {game.status === "completed"
                        ? "Done"
                        : game.status === "deleted"
                          ? "Deleted"
                          : "Ended"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Game */}
      <div className="new-game-section">
        <h2>New Game</h2>

        <OpponentSearch
          value={opponentInput}
          onChange={(val) => {
            setOpponentInput(val);
            if (selectedOpponent) setSelectedOpponent(null);
            if (error) setError(null);
          }}
          onSelect={handleOpponentSelect}
        />

        {selectedOpponent && (
          <div className="selected-opponent">
            {selectedOpponent.picture ? (
              <img
                src={selectedOpponent.picture}
                alt=""
                className="opponent-avatar"
              />
            ) : (
              <div className="opponent-avatar fallback">
                {(selectedOpponent.displayName || selectedOpponent.name || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}
            <div className="selected-opponent-info">
              <div className="selected-opponent-name">
                {selectedOpponent.displayName ||
                  selectedOpponent.name ||
                  "Anonymous"}
              </div>
              {selectedOpponent.nip05 && (
                <div className="selected-opponent-nip05">
                  {selectedOpponent.nip05}
                </div>
              )}
            </div>
            <button
              className="clear-btn"
              onClick={() => {
                setSelectedOpponent(null);
                setOpponentInput("");
              }}
            >
              Clear
            </button>
          </div>
        )}

        <button
          className="create-btn"
          onClick={handleCreateGame}
          disabled={isCreating || (!selectedOpponent && !opponentInput.trim())}
        >
          {isCreating ? "Creating..." : "Create Game"}
        </button>

        {/* Join existing game - collapsed by default */}
        <div className="join-toggle">
          <button
            className="join-toggle-btn"
            onClick={() => setShowJoinForm((prev) => !prev)}
          >
            {showJoinForm ? "Cancel" : "Join existing game →"}
          </button>
        </div>

        {showJoinForm && (
          <div className="join-form">
            <input
              type="text"
              placeholder="Game ID"
              value={joinGameId}
              onChange={(e) => setJoinGameId(e.target.value)}
            />
            <input
              type="text"
              placeholder="Opponent npub or pubkey"
              value={joinOpponent}
              onChange={(e) => setJoinOpponent(e.target.value)}
            />
            <button className="join-btn" onClick={handleJoinGame}>
              Join Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Lobby;
