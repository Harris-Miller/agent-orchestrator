export const THEME_IDS = ['original', 'latte', 'frappe', 'macchiato', 'mocha'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = 'original';
