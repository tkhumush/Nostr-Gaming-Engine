import { fetchEvents } from "./client";
import { decryptGameState } from "./encryption";
import type { GameState, GameStatus } from "../types/game";
import { GameEngine } from "../engine/GameEngine";
import { NostrSync } from "./NostrSync";
import {
  GAME_D_TAG_PREFIX,
  GAME_KIND,
  RACK_D_TAG_PREFIX,
} from "../types/nostr";

export interface GameSummary {
  gameId: string;
  opponentPubkey: string;
  players: string[];
  updatedAt: number;
  eventId: string;
  status?: GameStatus;
  turnIndex?: number;
  activePlayer?: string;
  deletedBy?: string;
  creatorPubkey?: string;
  playerOne?: string;
  playerTwo?: string;
  p1Score?: number;
  p2Score?: number;
}

const getTagValues = (tags: string[][], name: string): string[] =>
  tags.filter((tag) => tag[0] === name && tag[1]).map((tag) => tag[1]);

export async function fetchUserGames(
  pubkey: string,
  limit: number = 200,
): Promise<GameSummary[]> {
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#p": [pubkey],
    limit,
  });

  const map = new Map<string, GameSummary>();

  for (const event of events) {
    const dTag = getTagValues(event.tags, "d")[0];
    if (!dTag) continue;
    if (!dTag.startsWith(GAME_D_TAG_PREFIX)) continue;
    if (dTag.startsWith(RACK_D_TAG_PREFIX)) continue;

    const gameId = dTag.slice(GAME_D_TAG_PREFIX.length);
    const players = getTagValues(event.tags, "p");
    const opponent = players.find((p) => p !== pubkey) || "";
    const updatedAt = event.created_at || 0;

    const existing = map.get(gameId);
    if (!existing || updatedAt > existing.updatedAt) {
      map.set(gameId, {
        gameId,
        opponentPubkey: opponent,
        players,
        updatedAt,
        eventId: event.id,
      });
    }
  }

  const summaries = Array.from(map.values()).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  // Attempt to decrypt latest state to get status + turn info (parallel)
  await Promise.all(
    summaries.map(async (summary) => {
      const event = events.find((e) => e.id === summary.eventId);
      if (!event || !summary.opponentPubkey) return;
      try {
        const decryptKey =
          event.pubkey === pubkey ? summary.opponentPubkey : event.pubkey;
        const state = await decryptGameState<GameState>(
          decryptKey,
          event.content,
        );
        summary.status = state.meta.status;
        summary.deletedBy = state.meta.deletedBy;
        summary.creatorPubkey = state.meta.playerOne;
        summary.playerOne = state.meta.playerOne;
        summary.playerTwo = state.meta.playerTwo;
        summary.turnIndex = state.turn.index;
        summary.activePlayer = state.turn.activePlayer;
        summary.p1Score = state.scoring.p1Score;
        summary.p2Score = state.scoring.p2Score;
      } catch {
        // Skip if decryption fails
      }
    }),
  );

  return summaries;
}

export async function deleteGameFromLobby(
  gameId: string,
  userPubkey: string,
): Promise<void> {
  const dTag = `${GAME_D_TAG_PREFIX}${gameId}`;
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#d": [dTag],
    limit: 20,
  });

  if (events.length === 0) {
    throw new Error("Game not found on relays");
  }

  const sorted = events.sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0),
  );

  let lastError: Error | null = null;

  for (const event of sorted) {
    const players = getTagValues(event.tags, "p");
    if (players.length === 0 || !players.includes(userPubkey)) {
      continue;
    }
    const opponent = players.find((p) => p !== userPubkey) || "";
    if (!opponent) continue;

    try {
      const decryptKey = event.pubkey === userPubkey ? opponent : event.pubkey;
      const state = await decryptGameState<GameState>(
        decryptKey,
        event.content,
      );

      if (state.meta.playerOne !== userPubkey) {
        throw new Error("Only the game creator can delete this game");
      }

      const newState = GameEngine.deleteGame(state, userPubkey);
      const sync = new NostrSync(gameId, opponent);
      await sync.publishGameState(newState, event.id);
      await sync.publishDeletionForGame(
        `Deleted Words With Zaps game ${gameId}`,
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw (
    lastError || new Error("Unable to delete game. No decryptable state found.")
  );
}

export async function fetchGamePlayers(gameId: string): Promise<{
  players: string[];
  updatedAt: number;
  eventId: string;
} | null> {
  const dTag = `${GAME_D_TAG_PREFIX}${gameId}`;
  const events = await fetchEvents({
    kinds: [GAME_KIND],
    "#d": [dTag],
    limit: 10,
  });

  if (events.length === 0) return null;

  const sorted = events.sort(
    (a, b) => (b.created_at || 0) - (a.created_at || 0),
  );
  const latest = sorted[0];
  const players = getTagValues(latest.tags, "p");

  return {
    players,
    updatedAt: latest.created_at || 0,
    eventId: latest.id,
  };
}
