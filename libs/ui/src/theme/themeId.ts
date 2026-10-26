export const THEME_IDS = ['original', 'latte', 'frappe', 'macchiato', 'mocha'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = 'original';

/** localStorage paint-cache key for the last Theme preference (not User settings). */
export const THEME_PAINT_STORAGE_KEY = 'ao-desktop-theme';

/** Dark Theme preferences, so base-vega `dark:` variants apply. Not a separate toggle. */
export const DARK_THEME_IDS = ['original', 'frappe', 'macchiato', 'mocha'] as const satisfies readonly ThemeId[];

export const isDarkThemeId = (themeId: ThemeId): boolean => (DARK_THEME_IDS as readonly ThemeId[]).includes(themeId);
