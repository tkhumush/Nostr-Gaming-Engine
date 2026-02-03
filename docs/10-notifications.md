# Notifications

## Purpose

Notify opponents of game events (moves, game invites, nudges) using Nostr events and Lightning zaps. The platform supports multiple notification channels: public notes (Kind 1), private DMs (Kind 4), zaps (NIP-57), and browser notifications.

## Current Implementation

### Notification Channels

| Channel | Kind | Privacy | Payment | Use Case |
|---------|------|---------|---------|----------|
| Public Note | 1 | Public | No | Share moves socially |
| Private DM | 4 | Encrypted | No | Private game updates |
| Zap | 9734 | Public | Yes | Incentivized notifications |
| Browser | N/A | Local | No | Tab notifications |

### Zap & Share Modal

File: `src/components/ZapNudgeModal.tsx`

After each move, players can optionally:
1. Send a zap to their opponent (incentivized notification)
2. Share the move publicly (Kind 1) or privately (Kind 4)

```typescript
// Share options
const SHARE_OPTIONS: ShareOption[] = [
  { value: "none", label: "Don't share" },
  { value: "public", label: "Public note (kind 1)" },
  { value: "private", label: "Private DM (kind 4)" },
];

// Modal callback
onConfirm: (options: {
  zapAmount: number;    // 0 = no zap, >0 = sats to send
  shareMode: ShareMode; // "none" | "public" | "private"
}) => void | Promise<void>;
```

### Public Note (Kind 1)

Share moves to your social feed:

```typescript
// Example public note content
const publicNoteContent = `
I just played QUIZ for 22 points! 🎯

Score: Me 145 - Opponent 132

Playing Words With Zaps ⚡
#wordswithzaps #nostr
`;

// Create and publish Kind 1 event
const event = createEvent(1, publicNoteContent, [
  ["p", opponentPubkey],  // Tag opponent
  ["t", "wordswithzaps"], // Hashtag
]);
await publishEvent(event);
```

### Private DM (Kind 4)

Send encrypted notification to opponent:

```typescript
// Example DM content
const dmContent = `
Your turn! I played QUIZ for 22 points.
Score: 145 - 132

Game: ${gameId}
`;

// Encrypt with NIP-04
const encryptedContent = await window.nostr.nip04.encrypt(
  opponentPubkey,
  dmContent,
);

// Create and publish Kind 4 event
const event = createEvent(4, encryptedContent, [
  ["p", opponentPubkey],
]);
await publishEvent(event);
```

### Zap Notification (NIP-57)

Send sats with move notification:

```typescript
// Zap request content includes game context
const zapContent = `Played QUIZ for 22 points in Words With Zaps! ⚡`;

// Full zap flow (see 09-wallet-and-zaps.md)
await zapUser({
  recipientPubkey: opponentPubkey,
  amountSats: 21,
  gameId: gameState.meta.gameId,
  moveDescription: zapContent,
});
```

### Browser Notifications

File: `src/hooks/useGame.ts`

```typescript
// Request permission on mount
useEffect(() => {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}, []);

// Notify when turn changes to user
useEffect(() => {
  if (prevIsMyTurnRef.current === false && isMyTurn === true) {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Words With Zaps", {
        body: "It's your turn!",
        icon: "/assets/wwz_logo_stack.svg",
      });
    }
  }
  prevIsMyTurnRef.current = isMyTurn;
}, [isMyTurn]);
```

## Notification Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PLAYER MAKES MOVE                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ZAP & SHARE MODAL                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Move Summary: QUIZ for 22 points                                       ││
│  │  Score: You 145 - Opponent 132                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Zap Amount     │  │  Share Method   │  │                 │             │
│  │  [0] [21] [50]  │  │  [None]         │  │  [Zap & Share]  │             │
│  │  [100] [Custom] │  │  [Public]       │  │                 │             │
│  │                 │  │  [Private DM]   │  │                 │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │   Zap     │   │  Kind 1   │   │  Kind 4   │
            │ (NIP-57)  │   │  (Public) │   │  (DM)     │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NOSTR RELAYS                                      │
│  Events propagate to opponent's client                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPPONENT'S CLIENT                                   │
│  • Receives game state update (Kind 30078)                                  │
│  • May see public note in feed (Kind 1)                                     │
│  • May see DM notification (Kind 4)                                         │
│  • May receive zap notification (Kind 9735)                                 │
│  • Browser notification triggers if tab not focused                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Settings Integration

File: `src/settings/appSettings.ts`

```typescript
// User preferences for notifications
const ZAP_NUDGE_DEFAULT_AMOUNT_KEY = "wordswithzaps_zap_nudge_default_amount";
const SHARE_TO_NOSTR_DEFAULT_KEY = "wordswithzaps_share_to_nostr_default";
const SHARE_METHOD_DEFAULT_KEY = "wordswithzaps_share_method_default";

// Getters
export function getZapNudgeDefaultAmount(): number;
export function getShareToNostrDefault(): boolean;
export function getShareMethodDefault(): ShareMethod; // "public" | "private"

// Setters (persist to localStorage)
export function setZapNudgeDefaultAmount(amount: number): void;
export function setShareToNostrDefault(enabled: boolean): void;
export function setShareMethodDefault(method: ShareMethod): void;
```

## Game-Agnostic Interface

```typescript
interface NotificationProvider {
  // Public social notification
  sharePublicly(content: string, tags?: string[][]): Promise<void>;

  // Private DM to specific user
  sendDM(recipientPubkey: string, content: string): Promise<void>;

  // Zap with message
  zapUser(params: {
    recipientPubkey: string;
    amountSats: number;
    message: string;
    gameId?: string;
  }): Promise<string>;

  // Browser notification
  showBrowserNotification(title: string, body: string, icon?: string): void;
}
```

## Message Templates

### Move Notification

```typescript
function getMoveNotificationText(
  word: string,
  points: number,
  myScore: number,
  opponentScore: number,
  opponentName: string,
  isPublic: boolean,
): string {
  if (isPublic) {
    return `I just played ${word} for ${points} points! 🎯

Score: Me ${myScore} - ${opponentName} ${opponentScore}

Playing Words With Zaps ⚡
#wordswithzaps #nostr`;
  }

  return `Your turn! I played ${word} for ${points} points.
Score: ${myScore} - ${opponentScore}`;
}
```

### Game Invite

```typescript
function getGameInviteText(gameId: string, isPublic: boolean): string {
  if (isPublic) {
    return `I've started a new game of Words With Zaps! ⚡

Join me: ${window.location.origin}?game=${gameId}

#wordswithzaps #nostr`;
  }

  return `I've challenged you to a game of Words With Zaps!

Click to play: ${window.location.origin}?game=${gameId}`;
}
```

### Game Over

```typescript
function getGameOverText(
  won: boolean,
  finalScore: { me: number; opponent: number },
  opponentName: string,
): string {
  const result = won ? "won" : "lost";
  return `Game over! I ${result} ${finalScore.me} - ${finalScore.opponent} against ${opponentName} in Words With Zaps! ⚡

#wordswithzaps #nostr`;
}
```

## NIPs Used

| NIP | Purpose |
|-----|---------|
| NIP-01 | Kind 1 public notes |
| NIP-04 | Kind 4 encrypted DMs |
| NIP-57 | Zap requests and receipts |

## Reuse Guidance for New Games

1. **Update notification content** for your game:
   ```typescript
   // Chess example
   const moveNotification = `I played ${san}! ♟️

   ${isCheckmate ? "Checkmate! 🏆" : isCheck ? "Check! ⚡" : ""}

   Playing Nostr Chess
   #nostrchess #chess`;
   ```

2. **Customize zap messages**:
   ```typescript
   const zapContent = isCheckmate
     ? `Checkmate! GG! ♟️⚡`
     : `Played ${san} in Nostr Chess`;
   ```

3. **Add game-specific hashtags**:
   ```typescript
   const tags = [
     ["t", "nostrchess"],
     ["t", "chess"],
     ["p", opponentPubkey],
   ];
   ```

4. **Browser notification customization**:
   ```typescript
   new Notification("Nostr Chess", {
     body: isCheck ? "Check! Your turn." : "Your turn to move.",
     icon: "/chess-icon.png",
     tag: `chess-${gameId}`,  // Dedupe notifications
   });
   ```

5. **Consider notification frequency**:
   - Fast games (blitz chess): Maybe skip zaps, use browser only
   - Slow games (correspondence): Zaps more valuable as reminders

## Dependencies

- `src/nostr/client.ts` - Event creation and publishing
- `src/nostr/encryption.ts` - NIP-04 encryption for DMs
- `src/wallet/walletManager.ts` - Zap functionality
- Browser Notification API
