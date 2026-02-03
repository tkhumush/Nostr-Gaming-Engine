import type { GameState, PlayerRack } from "./game";

export interface NostrProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  about?: string; // Bio
  picture?: string;
  banner?: string; // Banner image
  nip05?: string;
  website?: string;
  lud16?: string; // Lightning address
  lud06?: string; // LNURL
}

export interface GameEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: 30078;
  tags: string[][];
  content: string; // encrypted GameState JSON
  sig: string;
}

export interface RackEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: 30078;
  tags: string[][];
  content: string; // encrypted PlayerRack JSON
  sig: string;
}

export interface DecryptedGameEvent {
  event: GameEvent;
  state: GameState;
}

export interface DecryptedRackEvent {
  event: RackEvent;
  rack: PlayerRack;
}

export const GAME_KIND = 30078;
export const GAME_D_TAG_PREFIX = "wordswithzaps_v1_";
export const RACK_D_TAG_PREFIX = "wordswithzaps_rack_";

// Default relay list - reliable, well-maintained relays
export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.nostr.net",
  "wss://nostr.wine",
  "wss://relay.noswhere.com",
];

// NIP-65 relay list kind
export const RELAY_LIST_KIND = 10002;
