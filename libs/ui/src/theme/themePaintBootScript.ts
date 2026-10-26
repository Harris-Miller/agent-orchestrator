import { DARK_THEME_IDS, DEFAULT_THEME_ID, THEME_IDS, THEME_PAINT_STORAGE_KEY } from './themeId.ts';

/**
 * Theme-id clamp copied into the head script via `toString()`.
 * The body must not close over module bindings: the webview runs this source alone.
 */
export const resolvePaintThemeId = (stored: unknown, allowed: readonly string[], fallback: string): string =>
  typeof stored === 'string' && allowed.includes(stored) ? stored : fallback;

/**
 * Document theme write copied into the head script via `toString()`.
 * The body must not close over module bindings: the webview runs this source alone.
 */
export const paintDocumentTheme = (themeId: string, darkIds: readonly string[]): void => {
  const root = document.documentElement;
  root.dataset.theme = themeId;
  root.classList.toggle('dark', darkIds.includes(themeId));
};

/** Blocking head script. Sets the Theme preference before the stylesheet paints. */
export const themePaintBootScript = `(() => {
  try {
    const id = (${resolvePaintThemeId.toString()})(localStorage.getItem(${JSON.stringify(THEME_PAINT_STORAGE_KEY)}), ${JSON.stringify([...THEME_IDS])}, ${JSON.stringify(DEFAULT_THEME_ID)});
    (${paintDocumentTheme.toString()})(id, ${JSON.stringify([...DARK_THEME_IDS])});
  } catch {
    // paint cache is best-effort
  }
})();`;
