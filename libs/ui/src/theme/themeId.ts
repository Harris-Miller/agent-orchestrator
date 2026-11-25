import type { ThemeId } from './themes.ts';

export const DEFAULT_LIGHT_THEME_ID: ThemeId = 'default-light';
export const DEFAULT_DARK_THEME_ID: ThemeId = 'default-dark';

/** Which slot is painted: always light, always dark, or follow the OS. */
export const PAINTED_SLOT_SETTINGS = ['light', 'dark', 'system'] as const;
export type PaintedSlotSetting = (typeof PAINTED_SLOT_SETTINGS)[number];
export const DEFAULT_PAINTED_SLOT_SETTING: PaintedSlotSetting = 'system';

export type Slot = 'dark' | 'light';
