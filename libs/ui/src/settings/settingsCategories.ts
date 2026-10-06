export const SETTINGS_CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'keyboard', label: 'Keyboard shortcuts' },
  { id: 'providers', label: 'Providers' },
  { id: 'git', label: 'Git' },
  { id: 'connections', label: 'Connections' },
  { id: 'about', label: 'About' },
] as const;

export type SettingsCategoryEntry = (typeof SETTINGS_CATEGORIES)[number];

export type SettingsCategoryId = SettingsCategoryEntry['id'];

export const isSettingsCategoryId = (value: string): value is SettingsCategoryId =>
  SETTINGS_CATEGORIES.some(entry => entry.id === value);

export const settingsCategoryLabel = (id: SettingsCategoryId): string =>
  SETTINGS_CATEGORIES.find(entry => entry.id === id)?.label ?? id;

/** Case-insensitive label substring filter; empty/whitespace query returns all categories. */
export const filterSettingsCategories = (query: string): readonly SettingsCategoryEntry[] => {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return SETTINGS_CATEGORIES;
  }
  return SETTINGS_CATEGORIES.filter(entry => entry.label.toLowerCase().includes(q));
};
