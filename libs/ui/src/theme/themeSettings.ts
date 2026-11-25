import {
  DEFAULT_DARK_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  DEFAULT_PAINTED_SLOT_SETTING,
  PAINTED_SLOT_SETTINGS,
} from './themeId.ts';
import type { PaintedSlotSetting, Slot } from './themeId.ts';
import { DARK_THEME_IDS, LIGHT_THEME_IDS } from './themes.ts';
import type { ThemeId } from './themes.ts';

/** The three stored theme choices: a Light palette, a Dark palette, and the Painted slot setting. */
export type ThemeSettings = {
  readonly darkTheme: ThemeId;
  readonly lightTheme: ThemeId;
  readonly paintedSlot: PaintedSlotSetting;
};

/** Settings fields the theme choice reads. `theme` is the legacy single palette id. */
export type ThemeSettingsInput = {
  readonly darkTheme?: unknown;
  readonly lightTheme?: unknown;
  readonly paintedSlot?: unknown;
  readonly theme?: unknown;
};

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  darkTheme: DEFAULT_DARK_THEME_ID,
  lightTheme: DEFAULT_LIGHT_THEME_ID,
  paintedSlot: DEFAULT_PAINTED_SLOT_SETTING,
};

const isIn = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

export const isLightThemeId = (value: unknown): value is ThemeId => isIn(LIGHT_THEME_IDS, value);
export const isDarkThemeId = (value: unknown): value is ThemeId => isIn(DARK_THEME_IDS, value);
export const isPaintedSlotSetting = (value: unknown): value is PaintedSlotSetting => isIn(PAINTED_SLOT_SETTINGS, value);

/** Legacy single `theme` string → the triple that keeps the same look. `original` is now Default (Dark). */
const fromLegacyTheme = (theme: unknown): ThemeSettings => {
  if (theme === 'original') {
    return { ...DEFAULT_THEME_SETTINGS, paintedSlot: 'dark' };
  }
  if (isDarkThemeId(theme)) {
    return { ...DEFAULT_THEME_SETTINGS, darkTheme: theme, paintedSlot: 'dark' };
  }
  if (isLightThemeId(theme)) {
    return { ...DEFAULT_THEME_SETTINGS, lightTheme: theme, paintedSlot: 'light' };
  }
  return DEFAULT_THEME_SETTINGS;
};

/** New fields win; otherwise the legacy `theme`; otherwise defaults. A wrong-mode or unknown id falls back to its slot's default. */
export const resolveThemeSettings = (input: ThemeSettingsInput): ThemeSettings => {
  const legacy = fromLegacyTheme(input.theme);
  return {
    darkTheme:
      input.darkTheme === undefined
        ? legacy.darkTheme
        : isDarkThemeId(input.darkTheme)
          ? input.darkTheme
          : DEFAULT_DARK_THEME_ID,
    lightTheme:
      input.lightTheme === undefined
        ? legacy.lightTheme
        : isLightThemeId(input.lightTheme)
          ? input.lightTheme
          : DEFAULT_LIGHT_THEME_ID,
    paintedSlot:
      input.paintedSlot === undefined
        ? legacy.paintedSlot
        : isPaintedSlotSetting(input.paintedSlot)
          ? input.paintedSlot
          : DEFAULT_PAINTED_SLOT_SETTING,
  };
};

/**
 * Which slot is painted. A Host that supplies a theme (VS Code) always decides via its mode; otherwise the setting,
 * with `system` following the OS.
 */
export const resolvePaintedSlot = (input: {
  readonly hostMode: Slot | undefined;
  readonly osPrefersDark: boolean;
  readonly paintedSlot: PaintedSlotSetting;
}): Slot => {
  if (input.hostMode !== undefined) {
    return input.hostMode;
  }
  if (input.paintedSlot === 'system') {
    return input.osPrefersDark ? 'dark' : 'light';
  }
  return input.paintedSlot;
};

/** The palette id painted for these settings. */
export const resolvePaintedThemeId = (input: {
  readonly hostMode: Slot | undefined;
  readonly osPrefersDark: boolean;
  readonly settings: ThemeSettings;
}): ThemeId =>
  resolvePaintedSlot({ ...input, paintedSlot: input.settings.paintedSlot }) === 'dark'
    ? input.settings.darkTheme
    : input.settings.lightTheme;
