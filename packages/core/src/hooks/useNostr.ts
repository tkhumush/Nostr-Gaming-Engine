import { useState, useEffect, useCallback, useRef } from "react";
import type { NDKUser } from "@nostr-dev-kit/ndk";
import {
  initializeNDK,
  connectWithNip07,
  connectWithPrivateKey as clientConnectWithPrivateKey,
  connectWithBunker as clientConnectWithBunker,
  generateKeypair as clientGenerateKeypair,
  generateNostrConnectURI as clientGenerateNostrConnectURI,
  waitForNostrConnect as clientWaitForNostrConnect,
  getCurrentUser,
  isConnected,
  getConnectedRelayCount,
  getRelayUrls,
  getConnectedRelayUrls,
  disconnect,
} from "../nostr/client";

export type AuthMethod = "nip07" | "private-key" | "nip46" | null;

export interface NostrConnectSession {
  uri: string;
  localKeyHex: string;
  secret: string;
}

export interface UseNostrReturn {
  user: NDKUser | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  authMethod: AuthMethod;
  relayCount: number;
  relayUrls: string[];
  connectedRelayUrls: string[];
  connect: () => Promise<void>;
  connectWithPrivateKey: (privateKeyHex: string) => Promise<void>;
  connectWithBunker: (bunkerUri: string) => Promise<void>;
  generateKeypair: () => { nsec: string; npub: string; secretKeyHex: string };
  startNostrConnect: () => Promise<NostrConnectSession>;
  waitForNostrConnect: (session: NostrConnectSession) => Promise<void>;
  cancelNostrConnect: () => void;
  disconnect: () => void;
}

const AUTO_CONNECT_KEY = "wwz_autoconnect";
const LAST_PUBKEY_KEY = "wwz_last_pubkey";
const AUTH_METHOD_KEY = "wwz_auth_method";
const PRIVATE_KEY_KEY = "wwz_private_key";
const NIP46_BUNKER_KEY = "wwz_nip46_bunker";
const NIP46_LOCAL_KEY = "wwz_nip46_local_key";

export function useNostr(): UseNostrReturn {
  const [user, setUser] = useState<NDKUser | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [relayCount, setRelayCount] = useState(0);
  const [relayUrls, setRelayUrls] = useState<string[]>([]);
  const [connectedRelayUrls, setConnectedRelayUrls] = useState<string[]>([]);
  const nostrConnectCancelledRef = useRef(false);

  // Check for existing connection on mount
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const existingUser = getCurrentUser();
      if (existingUser) {
        setUser(existingUser);
        return;
      }

      if (typeof window === "undefined") return;
      const shouldAutoConnect =
        window.localStorage.getItem(AUTO_CONNECT_KEY) === "1";
      if (!shouldAutoConnect) return;

      const storedAuthMethod = window.localStorage.getItem(
        AUTH_METHOD_KEY,
      ) as AuthMethod;

      setConnecting(true);
      try {
        await initializeNDK();

        let connectedUser: NDKUser | null = null;

        switch (storedAuthMethod) {
          case "private-key": {
            const privateKey = window.localStorage.getItem(PRIVATE_KEY_KEY);
            if (privateKey) {
              connectedUser = await clientConnectWithPrivateKey(privateKey);
            }
            break;
          }
          case "nip46": {
            const bunkerUri = window.localStorage.getItem(NIP46_BUNKER_KEY);
            const localKey = window.localStorage.getItem(NIP46_LOCAL_KEY);
            if (bunkerUri && localKey) {
              const result = await clientConnectWithBunker(bunkerUri, localKey);
              connectedUser = result.user;
            }
            break;
          }
          case "nip07":
          default:
            if (window.nostr) {
              connectedUser = await connectWithNip07();
            }
            break;
        }

        if (!cancelled && connectedUser) {
          setUser(connectedUser);
          setAuthMethod(storedAuthMethod || "nip07");
        }
      } catch {
        if (!cancelled) {
          setError(null);
        }
        // Clear all auth data on failure
        window.localStorage.removeItem(AUTO_CONNECT_KEY);
        window.localStorage.removeItem(LAST_PUBKEY_KEY);
        window.localStorage.removeItem(AUTH_METHOD_KEY);
        window.localStorage.removeItem(PRIVATE_KEY_KEY);
        window.localStorage.removeItem(NIP46_BUNKER_KEY);
        window.localStorage.removeItem(NIP46_LOCAL_KEY);
      } finally {
        if (!cancelled) {
          setConnecting(false);
        }
      }
    };

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      // Initialize NDK if not already
      await initializeNDK();

      // Connect with NIP-07 extension
      const connectedUser = await connectWithNip07();
      setUser(connectedUser);
      setAuthMethod("nip07");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTO_CONNECT_KEY, "1");
        window.localStorage.setItem(AUTH_METHOD_KEY, "nip07");
        window.localStorage.setItem(LAST_PUBKEY_KEY, connectedUser.pubkey);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectWithPrivateKey = useCallback(async (privateKeyHex: string) => {
    setConnecting(true);
    setError(null);

    try {
      await initializeNDK();
      const connectedUser = await clientConnectWithPrivateKey(privateKeyHex);
      setUser(connectedUser);
      setAuthMethod("private-key");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTO_CONNECT_KEY, "1");
        window.localStorage.setItem(AUTH_METHOD_KEY, "private-key");
        window.localStorage.setItem(PRIVATE_KEY_KEY, privateKeyHex);
        window.localStorage.setItem(LAST_PUBKEY_KEY, connectedUser.pubkey);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectWithBunker = useCallback(async (bunkerUri: string) => {
    setConnecting(true);
    setError(null);

    try {
      await initializeNDK();
      const { user: connectedUser, localKey } =
        await clientConnectWithBunker(bunkerUri);
      setUser(connectedUser);
      setAuthMethod("nip46");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTO_CONNECT_KEY, "1");
        window.localStorage.setItem(AUTH_METHOD_KEY, "nip46");
        window.localStorage.setItem(NIP46_BUNKER_KEY, bunkerUri);
        window.localStorage.setItem(NIP46_LOCAL_KEY, localKey);
        window.localStorage.setItem(LAST_PUBKEY_KEY, connectedUser.pubkey);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const generateKeypair = useCallback(() => {
    return clientGenerateKeypair();
  }, []);

  const startNostrConnect =
    useCallback(async (): Promise<NostrConnectSession> => {
      // Ensure NDK is initialized
      await initializeNDK();
      nostrConnectCancelledRef.current = false;
      const { uri, localKeyHex, secret } = clientGenerateNostrConnectURI();
      return { uri, localKeyHex, secret };
    }, []);

  const waitForNostrConnect = useCallback(
    async (session: NostrConnectSession) => {
      setConnecting(true);
      setError(null);
      nostrConnectCancelledRef.current = false;

      try {
        const { user: connectedUser, remotePubkey } =
          await clientWaitForNostrConnect(
            session.localKeyHex,
            session.secret,
            120000,
          );

        if (nostrConnectCancelledRef.current) {
          return;
        }

        setUser(connectedUser);
        setAuthMethod("nip46");

        // Build bunker URI for session restore
        if (typeof window !== "undefined") {
          const relays = ["wss://relay.nsec.app", "wss://relay.damus.io"];
          const bunkerParams = new URLSearchParams();
          relays.forEach((r) => bunkerParams.append("relay", r));
          const bunkerUri = `bunker://${remotePubkey}?${bunkerParams.toString()}`;

          window.localStorage.setItem(AUTO_CONNECT_KEY, "1");
          window.localStorage.setItem(AUTH_METHOD_KEY, "nip46");
          window.localStorage.setItem(NIP46_BUNKER_KEY, bunkerUri);
          window.localStorage.setItem(NIP46_LOCAL_KEY, session.localKeyHex);
          window.localStorage.setItem(LAST_PUBKEY_KEY, connectedUser.pubkey);
        }
      } catch (err) {
        if (nostrConnectCancelledRef.current) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Failed to connect";
        setError(message);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const cancelNostrConnect = useCallback(() => {
    nostrConnectCancelledRef.current = true;
    setConnecting(false);
    setError(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setUser(null);
    setError(null);
    setAuthMethod(null);
    setRelayCount(0);
    setRelayUrls([]);
    setConnectedRelayUrls([]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTO_CONNECT_KEY);
      window.localStorage.removeItem(LAST_PUBKEY_KEY);
      window.localStorage.removeItem(AUTH_METHOD_KEY);
      window.localStorage.removeItem(PRIVATE_KEY_KEY);
      window.localStorage.removeItem(NIP46_BUNKER_KEY);
      window.localStorage.removeItem(NIP46_LOCAL_KEY);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setRelayCount(0);
      return;
    }
    if (!authMethod) {
      setAuthMethod("nip07");
    }
    const updateCount = () => {
      setRelayCount(getConnectedRelayCount());
      setRelayUrls(getRelayUrls());
      setConnectedRelayUrls(getConnectedRelayUrls());
    };
    updateCount();
    const intervalId = window.setInterval(updateCount, 5000);
    return () => window.clearInterval(intervalId);
  }, [user?.pubkey, authMethod]);

  return {
    user,
    isConnected: isConnected(),
    isConnecting: connecting,
    error,
    authMethod,
    relayCount,
    relayUrls,
    connectedRelayUrls,
    connect,
    connectWithPrivateKey,
    connectWithBunker,
    generateKeypair,
    startNostrConnect,
    waitForNostrConnect,
    cancelNostrConnect,
    disconnect: handleDisconnect,
  };
}

export default useNostr;
