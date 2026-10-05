export const SETTINGS_CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'keyboard', label: 'Keyboard shortcuts' },
  { id: 'providers', label: 'Providers' },
  { id: 'git', label: 'Git' },
  { id: 'connections', label: 'Connections' },
  { id: 'about', label: 'About' },
] as const;

export type SettingsCategoryId = (typeof SETTINGS_CATEGORIES)[number]['id'];

export const isSettingsCategoryId = (value: string): value is SettingsCategoryId =>
  SETTINGS_CATEGORIES.some(entry => entry.id === value);

export const settingsCategoryLabel = (id: SettingsCategoryId): string =>
  SETTINGS_CATEGORIES.find(entry => entry.id === id)?.label ?? id;
