import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { FC } from 'react';

import { themeAtom, userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';
import type { ThemeId } from '../theme/themeId.ts';
import { THEME_IDS } from '../theme/themeId.ts';
import { isThemeId } from '../theme/themePaintCache.ts';

import { LabeledSelect } from './LabeledSelect.tsx';

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
    <LabeledSelect
      disabled={!editable}
      id="ao-theme-select"
      label="Theme"
      labelClassName="text-sm font-medium text-foreground"
      onValueChange={value => {
        if (isThemeId(value)) {
          setTheme(value);
        }
      }}
      options={THEME_IDS.map(id => ({ label: THEME_LABELS[id], value: id }))}
      triggerClassName="min-w-44"
      value={themeId}
    />
  );
};
