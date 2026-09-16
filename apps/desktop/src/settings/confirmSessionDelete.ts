import type { SettingsDocument } from '@lib/ao-home';

/** Prefer confirming session delete when the Settings field is unset. */
export const confirmSessionDeleteEnabled = (settings: SettingsDocument): boolean =>
  settings.confirmSessionDelete !== false;
