import { useAtomSet, useAtomValue } from '@effect/atom-react';
import FormControl from '@mui/material/FormControl';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { FC } from 'react';

import { themeAtom, userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';
import type { ThemeId } from '../theme/themeId.ts';
import { THEME_IDS } from '../theme/themeId.ts';
import { isThemeId } from '../theme/themePaintCache.ts';

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
    <FormControl disabled={!editable} size="small" sx={{ minWidth: 180 }}>
      <Select
        slotProps={{ input: { 'aria-label': 'Theme' } }}
        onChange={event => {
          if (isThemeId(event.target.value)) {
            setTheme(event.target.value);
          }
        }}
        value={themeId}
      >
        {THEME_IDS.map(id => (
          <MenuItem key={id} value={id}>
            {THEME_LABELS[id]}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
