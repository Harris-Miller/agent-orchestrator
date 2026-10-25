import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { FC } from 'react';

import { themeAtom, userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';
import type { ThemeId } from '../theme/themeId.ts';
import { THEME_IDS } from '../theme/themeId.ts';
import { isThemeId } from '../theme/themePaintCache.ts';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';

const THEME_LABELS: Record<ThemeId, string> = {
  frappe: 'Catppuccin Frappé',
  latte: 'Catppuccin Latte',
  macchiato: 'Catppuccin Macchiato',
  mocha: 'Catppuccin Mocha',
  original: 'Original',
};

/** Theme preference control for the Settings Appearance pane. */
export const ThemeSelect: FC = () => {
  const themeId = useAtomValue(themeAtom);
  const setTheme = useAtomSet(themeAtom);
  const editable = !userSettingsEditsDisabled(useAtomValue(userSettingsAtom));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" id="ao-theme-select-label">
        Theme
      </span>
      <Select
        disabled={!editable}
        onValueChange={value => {
          if (typeof value === 'string' && isThemeId(value)) {
            setTheme(value);
          }
        }}
        value={themeId}
      >
        <SelectTrigger aria-labelledby="ao-theme-select-label" className="min-w-44" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {THEME_IDS.map(id => (
            <SelectItem key={id} value={id}>
              {THEME_LABELS[id]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
