import { DARK_THEME_IDS, DEFAULT_THEME_ID, THEME_IDS, THEME_PAINT_STORAGE_KEY } from './themeId.ts';
import type { ThemeId } from './themeId.ts';
import { paintDocumentTheme, resolvePaintThemeId } from './themePaintBootScript.ts';

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && resolvePaintThemeId(value, THEME_IDS, DEFAULT_THEME_ID) === value;

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

/** Apply the Theme preference to the document before paint and when it changes. */
export const applyDocumentTheme = (themeId: ThemeId): void => {
  paintDocumentTheme(themeId, DARK_THEME_IDS);
};
