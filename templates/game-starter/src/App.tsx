/**
 * Main App Component
 *
 * This is a minimal starter. Customize with your game UI.
 */

import { useNostr, useWallet } from "@nostr-gaming-engine/core";
import { useGame } from "./hooks/useGame";

function App() {
  const { user, isConnected, connect, disconnect } = useNostr();
  const { state: walletState } = useWallet();
  const { gameState, isMyTurn, createGame, loadGame, makeMove, error } = useGame();

  // Not logged in
  if (!isConnected) {
    return (
      <div className="app">
        <h1>My Nostr Game</h1>
        <button onClick={connect}>Login with Nostr</button>
      </div>
    );
  }

  // No game loaded - show lobby
  if (!gameState) {
    return (
      <div className="app">
        <header>
          <span>Welcome, {user?.profile?.name || user?.npub?.slice(0, 12)}...</span>
          <button onClick={disconnect}>Logout</button>
        </header>

        <main>
          <h2>Start a New Game</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const input = form.elements.namedItem("opponent") as HTMLInputElement;
              try {
                await createGame(input.value);
              } catch (err) {
                console.error(err);
              }
            }}
          >
            <input
              name="opponent"
              type="text"
              placeholder="Opponent npub or pubkey"
              required
            />
            <button type="submit">Create Game</button>
          </form>

          {error && <p className="error">{error}</p>}
        </main>
      </div>
    );
  }

  // Game in progress
  return (
    <div className="app">
      <header>
        <span>Game: {gameState.meta.gameId.slice(0, 8)}...</span>
        <span>{isMyTurn ? "Your Turn" : "Opponent's Turn"}</span>
      </header>

      <main>
        {/* TODO: Replace with your game board component */}
        <div className="game-board">
          <p>Game Status: {gameState.meta.status}</p>
          <p>Turn: {gameState.turn.index}</p>

          {isMyTurn && (
            <div className="controls">
              <button
                onClick={() => {
                  // TODO: Open move selection UI
                  // makeMove({ ... });
                  alert("Implement your move UI!");
                }}
              >
                Make Move
              </button>
            </div>
          )}
        </div>

        {gameState.meta.status === "completed" && (
          <div className="game-over">
            <h2>Game Over!</h2>
            <p>
              Winner:{" "}
              {gameState.meta.winner === user?.pubkey ? "You!" : "Opponent"}
            </p>
          </div>
        )}
      </main>

      <footer>
        <p>
          Wallet:{" "}
          {walletState.connected
            ? `${walletState.balance} sats`
            : "Not connected"}
        </p>
      </footer>
    </div>
  );
}

export default App;
