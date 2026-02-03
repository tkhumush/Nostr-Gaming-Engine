/**
 * App settings module
 *
 * Persistent user preferences stored in localStorage
 */

export {
  getDisableGameplayZaps,
  setDisableGameplayZaps,
  getShareToNostrDefault,
  setShareToNostrDefault,
  getShareMethodDefault,
  setShareMethodDefault,
  getSaveShareSettingDefault,
  setSaveShareSettingDefault,
  getZapNudgeDefaultAmount,
  setZapNudgeDefaultAmount,
  subscribeAppSettings,
} from "./appSettings";

export type { ShareMethod } from "./appSettings";
