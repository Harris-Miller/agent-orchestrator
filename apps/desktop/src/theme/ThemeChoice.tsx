import { useAtomSet, useAtomValue } from '@effect/atom-react';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { ThemeProvider } from '@mui/material/styles';
import type { FC, ReactNode } from 'react';

import { themeAtom } from '../atoms/userSettings/theme.atoms.ts';
import { userSettingsAtom, userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';

import { THEME_IDS, THEME_LABELS, themes } from './theme.ts';
import { isThemeId } from './themePaintCache.ts';

export const AppThemeProvider: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const themeId = useAtomValue(themeAtom);

  return (
    <ThemeProvider noSsr theme={themes[themeId]}>
      {children}
    </ThemeProvider>
  );
};

/** Theme preference control for the Settings Appearance pane. */
export const ThemeSelect: FC = () => {
  const themeId = useAtomValue(themeAtom);
  const setTheme = useAtomSet(themeAtom);
  const editable = !userSettingsEditsDisabled(useAtomValue(userSettingsAtom));
  const labelId = 'ao-theme-select-label';

  return (
    <FormControl disabled={!editable} size="small" sx={{ minWidth: 180 }}>
      <InputLabel id={labelId}>Theme</InputLabel>
      <Select
        label="Theme"
        labelId={labelId}
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
