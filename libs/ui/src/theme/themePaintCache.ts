import { resolveThemeSettings } from './themeSettings.ts';
import type { ThemeSettings } from './themeSettings.ts';

/** localStorage paint-cache key for the last-resolved theme settings (not User settings source of truth). */
export const THEME_PAINT_STORAGE_KEY = 'hoa-desktop-theme';

/** Raw paint-cache value; null when missing or unreadable. */
export const readPaintThemeRaw = (): null | string => {
  try {
    return localStorage.getItem(THEME_PAINT_STORAGE_KEY);
  } catch {
    return null;
  }
};

/** Cache value → settings. JSON triple, or a legacy raw palette id string (mapped like the legacy `theme` setting). */
export const parsePaintThemeRaw = (raw: null | string): ThemeSettings => {
  if (raw === null) {
    return resolveThemeSettings({});
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return resolveThemeSettings(parsed);
    }
  } catch {
    // not JSON: legacy raw id
  }
  return resolveThemeSettings({ theme: raw });
};

export const readPaintThemeSettings = (): ThemeSettings => parsePaintThemeRaw(readPaintThemeRaw());

export const writePaintThemeSettings = (settings: ThemeSettings): void => {
  try {
    localStorage.setItem(THEME_PAINT_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // paint cache is best-effort
  }
};
