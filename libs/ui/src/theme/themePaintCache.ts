import { DEFAULT_THEME_ID, THEME_IDS } from './themeId.ts';
import type { ThemeId } from './themeId.ts';

/** localStorage paint-cache key for last-applied theme (not User settings source of truth). */
export const THEME_PAINT_STORAGE_KEY = 'ao-desktop-theme';

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);

export const clampThemeId = (value: unknown): ThemeId => (isThemeId(value) ? value : DEFAULT_THEME_ID);

/** Raw paint-cache value; null when missing or unreadable. */
export const readPaintThemeRaw = (): null | string => {
  try {
    return localStorage.getItem(THEME_PAINT_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const readPaintThemeId = (): ThemeId => clampThemeId(readPaintThemeRaw());

export const writePaintThemeId = (id: ThemeId): void => {
  try {
    localStorage.setItem(THEME_PAINT_STORAGE_KEY, id);
  } catch {
    // paint cache is best-effort
  }
};
