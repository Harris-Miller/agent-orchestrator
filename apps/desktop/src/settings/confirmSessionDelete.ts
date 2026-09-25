import type { UserSettings } from '@lib/ao-home';

/** Prefer confirming session delete when the Settings field is unset. */
export const confirmSessionDeleteEnabled = (settings: UserSettings): boolean => settings.confirmSessionDelete !== false;
