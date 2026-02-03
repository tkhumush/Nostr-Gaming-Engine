const DISABLE_GAMEPLAY_ZAPS_KEY = "wordswithzaps_disable_gameplay_zaps";
const DEFAULT_DISABLE_GAMEPLAY_ZAPS = false;
const SHARE_TO_NOSTR_DEFAULT_KEY = "wordswithzaps_share_to_nostr_default";
const DEFAULT_SHARE_TO_NOSTR = true;
const SHARE_METHOD_DEFAULT_KEY = "wordswithzaps_share_method_default";
const DEFAULT_SHARE_METHOD: ShareMethod = "public";
const SAVE_SHARE_SETTING_KEY = "wordswithzaps_save_share_setting";
const DEFAULT_SAVE_SHARE_SETTING = true;
const ZAP_NUDGE_DEFAULT_AMOUNT_KEY = "wordswithzaps_zap_nudge_default_amount";
const DEFAULT_ZAP_NUDGE_AMOUNT = 0;

type SettingsListener = () => void;
export type ShareMethod = "public" | "private";
const listeners: Set<SettingsListener> = new Set();

function migrateGameplayZapsSetting(): void {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(DISABLE_GAMEPLAY_ZAPS_KEY);
    if (stored === "true") {
      localStorage.removeItem(DISABLE_GAMEPLAY_ZAPS_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

migrateGameplayZapsSetting();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  });
}

export function getDisableGameplayZaps(): boolean {
  if (typeof window === "undefined") return DEFAULT_DISABLE_GAMEPLAY_ZAPS;
  try {
    const stored = localStorage.getItem(DISABLE_GAMEPLAY_ZAPS_KEY);
    if (stored === null) return DEFAULT_DISABLE_GAMEPLAY_ZAPS;
    return stored === "true";
  } catch {
    return DEFAULT_DISABLE_GAMEPLAY_ZAPS;
  }
}

export function setDisableGameplayZaps(disabled: boolean): void {
  try {
    const current = getDisableGameplayZaps();
    localStorage.setItem(DISABLE_GAMEPLAY_ZAPS_KEY, String(disabled));
    if (current !== disabled) {
      notifyListeners();
    }
  } catch {
    // Ignore storage errors
  }
}

export function getShareToNostrDefault(): boolean {
  if (typeof window === "undefined") return DEFAULT_SHARE_TO_NOSTR;
  try {
    const stored = localStorage.getItem(SHARE_TO_NOSTR_DEFAULT_KEY);
    if (stored === null) return DEFAULT_SHARE_TO_NOSTR;
    return stored === "true";
  } catch {
    return DEFAULT_SHARE_TO_NOSTR;
  }
}

export function setShareToNostrDefault(enabled: boolean): void {
  try {
    const current = getShareToNostrDefault();
    localStorage.setItem(SHARE_TO_NOSTR_DEFAULT_KEY, String(enabled));
    if (current !== enabled) {
      notifyListeners();
    }
  } catch {
    // Ignore storage errors
  }
}

export function getShareMethodDefault(): ShareMethod {
  if (typeof window === "undefined") return DEFAULT_SHARE_METHOD;
  try {
    const stored = localStorage.getItem(SHARE_METHOD_DEFAULT_KEY);
    if (stored === "public" || stored === "private") return stored;
    return DEFAULT_SHARE_METHOD;
  } catch {
    return DEFAULT_SHARE_METHOD;
  }
}

export function setShareMethodDefault(method: ShareMethod): void {
  try {
    localStorage.setItem(SHARE_METHOD_DEFAULT_KEY, method);
  } catch {
    // Ignore storage errors
  }
}

export function getSaveShareSettingDefault(): boolean {
  if (typeof window === "undefined") return DEFAULT_SAVE_SHARE_SETTING;
  try {
    const stored = localStorage.getItem(SAVE_SHARE_SETTING_KEY);
    if (stored === null) return DEFAULT_SAVE_SHARE_SETTING;
    return stored === "true";
  } catch {
    return DEFAULT_SAVE_SHARE_SETTING;
  }
}

export function setSaveShareSettingDefault(enabled: boolean): void {
  try {
    localStorage.setItem(SAVE_SHARE_SETTING_KEY, String(enabled));
  } catch {
    // Ignore storage errors
  }
}

export function subscribeAppSettings(listener: SettingsListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getZapNudgeDefaultAmount(): number {
  if (typeof window === "undefined") return DEFAULT_ZAP_NUDGE_AMOUNT;
  try {
    const stored = localStorage.getItem(ZAP_NUDGE_DEFAULT_AMOUNT_KEY);
    if (!stored) return DEFAULT_ZAP_NUDGE_AMOUNT;
    const parsed = parseInt(stored, 10);
    return Number.isFinite(parsed) ? parsed : DEFAULT_ZAP_NUDGE_AMOUNT;
  } catch {
    return DEFAULT_ZAP_NUDGE_AMOUNT;
  }
}

export function setZapNudgeDefaultAmount(amount: number): void {
  try {
    localStorage.setItem(ZAP_NUDGE_DEFAULT_AMOUNT_KEY, String(amount));
  } catch {
    // Ignore storage errors
  }
}
