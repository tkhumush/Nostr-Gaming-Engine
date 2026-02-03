import { useState, useEffect, useCallback, useRef } from "react";
import {
  useNostr,
  useWallet,
  getCurrentUser,
  WalletKind,
  fetchGamePlayers,
  sendPayment,
} from "@nostr-gaming-engine/core";
import { getDictionary } from "./engine/Dictionary";
import LoginScreen from "./components/LoginScreen";
import Lobby from "./components/Lobby";
import GameView from "./components/GameView";
import NavBar from "./components/NavBar";
import WalletSettings from "./components/WalletSettings";
import ProfileSettings from "./components/ProfileSettings";
import CreatorZapModal from "./components/CreatorZapModal";
import AboutModal from "./components/AboutModal";
import RelayListModal from "./components/RelayListModal";
import ZapAnimation from "./components/ZapAnimation";
import "./index.css";

type Screen = "login" | "lobby" | "game";

interface GameSession {
  gameId: string;
  opponentPubkey: string;
}

function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [, setDictionaryLoaded] = useState(false);
  const [dictionaryError, setDictionaryError] = useState<string | null>(null);
  const [prefillGameId, setPrefillGameId] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "success" | "error" | "info";
  } | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const {
    isConnected,
    user,
    disconnect,
    connect,
    connectWithPrivateKey,
    connectWithBunker,
    generateKeypair,
    startNostrConnect,
    waitForNostrConnect,
    cancelNostrConnect,
    isConnecting,
    error,
    authMethod,
    relayCount,
    relayUrls,
    connectedRelayUrls,
  } = useNostr();
  const {
    state: walletState,
    isReady: walletReady,
    activeWallet,
    bitcoinConnectConnected,
    refreshBalance,
  } = useWallet();
  const [showWalletSettings, setShowWalletSettings] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showCreatorZapModal, setShowCreatorZapModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showRelayListModal, setShowRelayListModal] = useState(false);
  const [showZapAnimation, setShowZapAnimation] = useState(false);
  const creatorZapReturnRef = useRef<null | (() => void)>(null);
  const walletType = activeWallet
    ? activeWallet.kind === WalletKind.SPARK
      ? "spark"
      : "nwc"
    : bitcoinConnectConnected
      ? "bitcoin-connect"
      : "none";

  const handleOpenWalletSettings = useCallback(() => {
    setShowWalletSettings(true);
  }, []);

  const handleCloseWalletSettings = useCallback(() => {
    setShowWalletSettings(false);
  }, []);

  const handleOpenProfileSettings = useCallback(() => {
    setShowProfileSettings(true);
  }, []);

  const handleCloseProfileSettings = useCallback(() => {
    setShowProfileSettings(false);
  }, []);

  const handleOpenCreatorZap = useCallback((onReturn?: () => void) => {
    creatorZapReturnRef.current = onReturn || null;
    setShowCreatorZapModal(true);
  }, []);

  const handleCloseCreatorZap = useCallback(() => {
    setShowCreatorZapModal(false);
    const returnCallback = creatorZapReturnRef.current;
    creatorZapReturnRef.current = null;
    if (returnCallback) {
      returnCallback();
    }
  }, []);

  const handleOpenAbout = useCallback(() => {
    setShowAboutModal(true);
  }, []);

  const handleCloseAbout = useCallback(() => {
    setShowAboutModal(false);
  }, []);

  const handleOpenRelayList = useCallback(() => {
    setShowRelayListModal(true);
  }, []);

  const handleCloseRelayList = useCallback(() => {
    setShowRelayListModal(false);
  }, []);

  const showToast = useCallback(
    (message: string, tone: "success" | "error" | "info" = "success") => {
      setToast({ message, tone });
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
      toastTimeoutRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimeoutRef.current = null;
      }, 1800);
    },
    [],
  );

  const handleZapCreator = useCallback(
    async (amount: number) => {
      const result = await sendPayment("daniel@breez.tips", {
        amount,
        comment: "Words With Zaps - thanks for the game!",
      });
      if (!result.success) {
        const message = result.error || "Zap failed";
        showToast(message, "error");
        throw new Error(message);
      }
      setShowZapAnimation(true);
      showToast(`Sent ${amount} sat${amount === 1 ? "" : "s"}!`, "success");
    },
    [showToast],
  );

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    },
    [],
  );

  // Load dictionary on mount
  useEffect(() => {
    const loadDictionary = async () => {
      try {
        const dict = getDictionary();
        if (!dict.isLoaded()) {
          const candidates = [
            import.meta.env.VITE_DICTIONARY_URL,
            "/dictionaries/wwzwords1.txt",
            "/dictionaries/sowpods.txt",
            "/dictionaries/csw21.txt",
            "/dictionaries/nwl2023.txt",
            "/dictionaries/twl06.txt",
            "/dictionaries/enable1.txt",
          ].filter(Boolean) as string[];

          let loadedFrom: string | null = null;
          let lastError: Error | null = null;

          for (const url of candidates) {
            try {
              await dict.loadFromUrl(url);
              loadedFrom = url;
              break;
            } catch (err) {
              lastError = err instanceof Error ? err : new Error(String(err));
            }
          }

          if (!loadedFrom) {
            throw (
              lastError ||
              new Error("No dictionary file found in /public/dictionaries")
            );
          }
        }
        setDictionaryLoaded(true);
      } catch (err) {
        console.warn("Failed to load dictionary:", err);
        // Load a minimal dictionary for testing
        const dict = getDictionary();
        dict.loadWords([
          "CAT",
          "CATS",
          "DOG",
          "DOGS",
          "HAT",
          "HATS",
          "BAT",
          "BATS",
          "RAT",
          "RATS",
          "MAT",
          "MATS",
          "SAT",
          "AT",
          "IT",
          "IS",
          "AS",
          "THE",
          "AND",
          "FOR",
          "ARE",
          "BUT",
          "NOT",
          "YOU",
          "ALL",
          "WORD",
          "WORDS",
          "PLAY",
          "PLAYS",
          "GAME",
          "GAMES",
          "QUIZ",
          "QUIZZES",
          "JAZZ",
          "FIZZ",
          "BUZZ",
          "PA",
          "PAR",
          "PAIR",
          "PAIRS",
        ]);
        setDictionaryLoaded(true);
        setDictionaryError(
          "Using limited dictionary. Add a word list file to /public/dictionaries/ (sowpods.txt, csw21.txt, nwl2023.txt, twl06.txt, or enable1.txt).",
        );
      }
    };

    loadDictionary();
  }, []);

  // Update screen based on connection status
  useEffect(() => {
    if (!isConnected && screen !== "login") {
      setScreen("login");
    }
  }, [isConnected, screen]);

  useEffect(() => {
    if (isConnected && screen === "login" && !prefillGameId) {
      setScreen("lobby");
    }
  }, [isConnected, screen, prefillGameId]);

  useEffect(() => {
    if (isConnected && user?.pubkey) {
      refreshBalance().catch(() => {});
    }
  }, [isConnected, refreshBalance, user?.pubkey]);

  // Read gameId from URL on first load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get("gameId");
    if (gameId) {
      setPrefillGameId(gameId.trim());
    }
  }, []);

  // Auto-join game when a link is provided
  useEffect(() => {
    if (!prefillGameId || !isConnected || screen === "game") {
      return;
    }

    const user = getCurrentUser();
    if (!user?.pubkey) return;

    let cancelled = false;

    const resolveOpponent = async () => {
      try {
        const meta = await fetchGamePlayers(prefillGameId);
        if (!meta || meta.players.length === 0) {
          if (!cancelled) {
            setPrefillError("Game not found on relays yet.");
          }
          return;
        }

        if (!meta.players.includes(user.pubkey)) {
          if (!cancelled) {
            setPrefillGameId(null);
            setPrefillError(null);
            const url = new URL(window.location.href);
            url.searchParams.delete("gameId");
            window.history.replaceState({}, "", url.toString());
            setScreen("lobby");
          }
          return;
        }

        const opponent =
          meta.players.find((p) => p !== user.pubkey) || meta.players[0];
        if (!opponent) {
          if (!cancelled) {
            setPrefillError("Could not determine opponent for this game.");
          }
          return;
        }

        if (!cancelled) {
          setGameSession({ gameId: prefillGameId, opponentPubkey: opponent });
          setScreen("game");
        }
      } catch (err) {
        if (!cancelled) {
          setPrefillError(
            err instanceof Error ? err.message : "Failed to open game link.",
          );
        }
      }
    };

    resolveOpponent();

    return () => {
      cancelled = true;
    };
  }, [prefillGameId, isConnected, screen]);

  const handleConnected = () => {
    setScreen("lobby");
  };

  const handleGameStart = (gameId: string, opponentPubkey: string) => {
    setGameSession({ gameId, opponentPubkey });
    setScreen("game");
  };

  const handleBackToLobby = () => {
    setGameSession(null);
    setPrefillGameId(null); // Clear so we don't auto-rejoin
    // Clear gameId from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("gameId");
    window.history.replaceState({}, "", url.toString());
    setScreen("lobby");
  };

  const handleDisconnect = () => {
    disconnect();
    setGameSession(null);
    setScreen("login");
  };

  return (
    <div className={`app ${screen === "game" ? "game-mode" : ""}`}>
      {dictionaryError && (
        <div className="dictionary-warning">{dictionaryError}</div>
      )}

      {screen === "login" && (
        <LoginScreen
          onConnected={handleConnected}
          user={user}
          isConnecting={isConnecting}
          error={error}
          connect={connect}
          connectWithPrivateKey={connectWithPrivateKey}
          connectWithBunker={connectWithBunker}
          generateKeypair={generateKeypair}
          startNostrConnect={startNostrConnect}
          waitForNostrConnect={waitForNostrConnect}
          cancelNostrConnect={cancelNostrConnect}
        />
      )}

      {screen === "lobby" && (
        <>
          <NavBar
            user={user}
            onDisconnect={handleDisconnect}
            onOpenSupportZap={handleOpenCreatorZap}
            walletConnected={walletReady}
            walletBalance={walletState.balance}
            walletLoading={walletState.loading}
            walletType={walletType}
            onOpenWalletSettings={handleOpenWalletSettings}
            onOpenProfileSettings={handleOpenProfileSettings}
            onOpenAbout={handleOpenAbout}
            connectionMethod={authMethod}
            relayCount={relayCount}
            onOpenRelayList={handleOpenRelayList}
          />
          <Lobby
            onGameStart={handleGameStart}
            prefillGameId={prefillGameId}
            prefillError={prefillError}
          />
        </>
      )}

      {screen === "game" && gameSession && (
        <>
          <NavBar
            user={user}
            onDisconnect={handleDisconnect}
            onBackToLobby={handleBackToLobby}
            onOpenSupportZap={handleOpenCreatorZap}
            walletConnected={walletReady}
            walletBalance={walletState.balance}
            walletLoading={walletState.loading}
            walletType={walletType}
            onOpenWalletSettings={handleOpenWalletSettings}
            onOpenProfileSettings={handleOpenProfileSettings}
            onOpenAbout={handleOpenAbout}
            connectionMethod={authMethod}
            relayCount={relayCount}
            onOpenRelayList={handleOpenRelayList}
          />
          <GameView
            gameId={gameSession.gameId}
            opponentPubkey={gameSession.opponentPubkey}
            onToast={showToast}
            onOpenCreatorZap={handleOpenCreatorZap}
            onOpenWalletSettings={handleOpenWalletSettings}
            onOpenRelayList={handleOpenRelayList}
          />
        </>
      )}

      {toast && (
        <div className={`app-toast ${toast.tone || "success"}`}>
          {toast.message}
        </div>
      )}

      {showWalletSettings && (
        <WalletSettings onClose={handleCloseWalletSettings} />
      )}

      {showProfileSettings && (
        <ProfileSettings
          onClose={handleCloseProfileSettings}
          onToast={showToast}
        />
      )}

      <CreatorZapModal
        open={showCreatorZapModal}
        walletConnected={
          walletReady || walletState.connected || bitcoinConnectConnected
        }
        onClose={handleCloseCreatorZap}
        onSendZap={handleZapCreator}
      />

      <AboutModal
        open={showAboutModal}
        onClose={handleCloseAbout}
        onZapCreator={handleOpenCreatorZap}
      />

      <RelayListModal
        open={showRelayListModal}
        relays={relayUrls}
        connectedRelays={connectedRelayUrls}
        onClose={handleCloseRelayList}
      />

      {showZapAnimation && (
        <ZapAnimation onComplete={() => setShowZapAnimation(false)} />
      )}
    </div>
  );
}

export default App;
