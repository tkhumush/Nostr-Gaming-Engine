# App Settings

## Purpose

Manage user preferences that persist across sessions via localStorage. Settings include zap behavior, sharing preferences, and notification options.

## Current Implementation

### File: `src/settings/appSettings.ts`

### Settings Store Pattern

```typescript
// src/settings/appSettings.ts

// LocalStorage keys (prefix with your game name)
const DISABLE_GAMEPLAY_ZAPS_KEY = "wordswithzaps_disable_gameplay_zaps";
const SHARE_TO_NOSTR_DEFAULT_KEY = "wordswithzaps_share_to_nostr_default";
const SHARE_METHOD_DEFAULT_KEY = "wordswithzaps_share_method_default";
const ZAP_NUDGE_DEFAULT_AMOUNT_KEY = "wordswithzaps_zap_nudge_default_amount";

// Observable pattern for React integration
type SettingsListener = () => void;
const listeners: Set<SettingsListener> = new Set();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  });
}

export function subscribeAppSettings(listener: SettingsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
```

### Available Settings

#### 1. Disable Gameplay Zaps

Skip sending zaps with each move:

```typescript
export function getDisableGameplayZaps(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(DISABLE_GAMEPLAY_ZAPS_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

export function setDisableGameplayZaps(disabled: boolean): void {
  try {
    localStorage.setItem(DISABLE_GAMEPLAY_ZAPS_KEY, String(disabled));
    notifyListeners();
  } catch {
    // Ignore storage errors
  }
}
```

#### 2. Share to Nostr Default

Auto-share game results to social feed:

```typescript
export function getShareToNostrDefault(): boolean {
  return localStorage.getItem(SHARE_TO_NOSTR_DEFAULT_KEY) !== "false";
}

export function setShareToNostrDefault(enabled: boolean): void {
  localStorage.setItem(SHARE_TO_NOSTR_DEFAULT_KEY, String(enabled));
  notifyListeners();
}
```

#### 3. Share Method (Public/Private)

How to share game invites:

```typescript
export type ShareMethod = "public" | "private";

export function getShareMethodDefault(): ShareMethod {
  const stored = localStorage.getItem(SHARE_METHOD_DEFAULT_KEY);
  return stored === "private" ? "private" : "public";
}

export function setShareMethodDefault(method: ShareMethod): void {
  localStorage.setItem(SHARE_METHOD_DEFAULT_KEY, method);
}
```

#### 4. Zap Nudge Amount

Default amount for "nudge" zaps to remind opponent:

```typescript
export function getZapNudgeDefaultAmount(): number {
  const stored = localStorage.getItem(ZAP_NUDGE_DEFAULT_AMOUNT_KEY);
  if (!stored) return 0;  // 0 means disabled
  const parsed = parseInt(stored, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function setZapNudgeDefaultAmount(amount: number): void {
  localStorage.setItem(ZAP_NUDGE_DEFAULT_AMOUNT_KEY, String(amount));
}
```

### React Integration

```typescript
// Using settings in a component
function SettingsPanel() {
  const [disableZaps, setDisableZapsState] = useState(getDisableGameplayZaps);

  useEffect(() => {
    // Subscribe to changes from other components
    const unsubscribe = subscribeAppSettings(() => {
      setDisableZapsState(getDisableGameplayZaps());
    });
    return unsubscribe;
  }, []);

  const handleToggle = () => {
    const newValue = !disableZaps;
    setDisableGameplayZaps(newValue);
    setDisableZapsState(newValue);
  };

  return (
    <label>
      <input type="checkbox" checked={disableZaps} onChange={handleToggle} />
      Skip zaps with moves
    </label>
  );
}
```

## Game-Agnostic Interface

```typescript
interface AppSettings {
  // Getters
  getSetting<T>(key: string, defaultValue: T): T;
  getBooleanSetting(key: string, defaultValue: boolean): boolean;
  getNumberSetting(key: string, defaultValue: number): number;
  getStringSetting(key: string, defaultValue: string): string;

  // Setters
  setSetting<T>(key: string, value: T): void;

  // Subscription
  subscribe(listener: () => void): () => void;

  // Migration
  migrateSetting(oldKey: string, newKey: string): void;
}
```

## Common Game Settings

For a new game, consider these settings:

| Setting | Type | Purpose |
|---------|------|---------|
| `disableZaps` | boolean | Skip payment with moves |
| `defaultZapAmount` | number | Sats to send per move |
| `shareResults` | boolean | Post game results to feed |
| `soundEffects` | boolean | Play sounds on events |
| `notifications` | boolean | Browser notifications |
| `autoAcceptRematch` | boolean | Auto-accept rematches |
| `theme` | string | Light/dark/system |
| `boardOrientation` | string | For chess: always-white, flip |

## Settings Migration

When updating settings structure:

```typescript
// src/settings/appSettings.ts
function migrateSettings(): void {
  if (typeof window === "undefined") return;

  // Example: Rename old key to new key
  try {
    const oldValue = localStorage.getItem("old_setting_key");
    if (oldValue !== null) {
      localStorage.setItem("new_setting_key", oldValue);
      localStorage.removeItem("old_setting_key");
    }
  } catch {
    // Ignore storage errors
  }
}

// Run on module load
migrateSettings();
```

## Storage Namespacing

Always prefix localStorage keys to avoid conflicts:

```typescript
// Bad - could conflict with other apps
const THEME_KEY = "theme";

// Good - namespaced to your app
const THEME_KEY = "nostr_chess_theme";
```

## Reuse Guidance for New Games

1. **Copy the settings module** and update prefixes:
   ```typescript
   // src/settings/appSettings.ts
   const SETTINGS_PREFIX = "nostr_chess_";

   function getKey(name: string): string {
     return `${SETTINGS_PREFIX}${name}`;
   }
   ```

2. **Add game-specific settings**:
   ```typescript
   // Chess-specific
   export function getBoardOrientation(): 'white' | 'black' | 'auto' {
     return localStorage.getItem(getKey('board_orientation')) || 'auto';
   }

   export function getShowLegalMoves(): boolean {
     return localStorage.getItem(getKey('show_legal_moves')) !== 'false';
   }

   export function getEnablePremoves(): boolean {
     return localStorage.getItem(getKey('enable_premoves')) === 'true';
   }
   ```

3. **Create a settings UI**:
   ```tsx
   function ChessSettings() {
     return (
       <div className="settings-panel">
         <h3>Game Settings</h3>
         <ToggleSetting
           label="Show legal moves"
           value={getShowLegalMoves()}
           onChange={setShowLegalMoves}
         />
         <ToggleSetting
           label="Enable premoves"
           value={getEnablePremoves()}
           onChange={setEnablePremoves}
         />
         <SelectSetting
           label="Board orientation"
           value={getBoardOrientation()}
           options={['white', 'black', 'auto']}
           onChange={setBoardOrientation}
         />
       </div>
     );
   }
   ```

4. **Export settings for backup**:
   ```typescript
   export function exportSettings(): Record<string, string> {
     const settings: Record<string, string> = {};
     for (let i = 0; i < localStorage.length; i++) {
       const key = localStorage.key(i);
       if (key?.startsWith(SETTINGS_PREFIX)) {
         settings[key] = localStorage.getItem(key) || '';
       }
     }
     return settings;
   }

   export function importSettings(settings: Record<string, string>): void {
     for (const [key, value] of Object.entries(settings)) {
       if (key.startsWith(SETTINGS_PREFIX)) {
         localStorage.setItem(key, value);
       }
     }
     notifyListeners();
   }
   ```

## Error Handling

localStorage can fail (private browsing, quota exceeded):

```typescript
export function getSetting(key: string, defaultValue: string): string {
  if (typeof window === "undefined") return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    return stored ?? defaultValue;
  } catch {
    // localStorage unavailable (private browsing, etc.)
    return defaultValue;
  }
}

export function setSetting(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    notifyListeners();
    return true;
  } catch (e) {
    console.warn('Failed to save setting:', e);
    return false;
  }
}
```

## Dependencies

None - uses only browser localStorage API.
