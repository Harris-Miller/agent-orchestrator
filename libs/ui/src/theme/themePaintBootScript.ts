import { DARK_THEME_IDS, DEFAULT_THEME_ID, THEME_IDS, THEME_PAINT_STORAGE_KEY } from './themeId.ts';

/** Blocking head script. Sets the Theme preference before the stylesheet paints. */
export const themePaintBootScript = `(() => {
  try {
    const allowed = ${JSON.stringify([...THEME_IDS])};
    const stored = localStorage.getItem(${JSON.stringify(THEME_PAINT_STORAGE_KEY)});
    const id = typeof stored === "string" && allowed.includes(stored) ? stored : ${JSON.stringify(DEFAULT_THEME_ID)};
    const root = document.documentElement;
    root.dataset.theme = id;
    root.classList.toggle("dark", ${JSON.stringify([...DARK_THEME_IDS])}.includes(id));
  } catch {
    // paint cache is best-effort
  }
})();`;
