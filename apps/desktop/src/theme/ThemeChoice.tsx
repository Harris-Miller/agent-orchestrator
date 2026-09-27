import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { isThemeId, THEME_IDS, themeAtom, userSettingsAtom, userSettingsEditsDisabled } from '@lib/ui';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { ThemeProvider } from '@mui/material/styles';
import type { FC, ReactNode } from 'react';

import { THEME_LABELS, themes } from './theme.ts';

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
