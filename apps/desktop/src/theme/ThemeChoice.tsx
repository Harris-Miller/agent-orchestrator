import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { ThemeProvider } from '@mui/material/styles';
import { useMemo, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { DEFAULT_THEME_ID, THEME_IDS, THEME_LABELS, themes } from './theme.ts';
import type { ThemeId } from './theme.ts';
import { ThemeChoiceContext, useThemeChoice } from './themeChoiceContext.ts';

const STORAGE_KEY = 'ao-desktop-theme';

const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);

const loadThemeId = (): ThemeId => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isThemeId(raw) ? raw : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
};

export const AppThemeProvider: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const [themeId, setThemeId] = useState(loadThemeId);

  const value = useMemo(
    () => ({
      setThemeId: (id: ThemeId) => {
        localStorage.setItem(STORAGE_KEY, id);
        setThemeId(id);
      },
      themeId,
    }),
    [themeId],
  );

  return (
    <ThemeChoiceContext.Provider value={value}>
      <ThemeProvider noSsr theme={themes[themeId]}>
        {children}
      </ThemeProvider>
    </ThemeChoiceContext.Provider>
  );
};

export const ThemeSelect: FC = () => {
  const { setThemeId, themeId } = useThemeChoice();
  const labelId = 'ao-theme-select-label';

  return (
    <FormControl size="small" sx={{ minWidth: 180 }}>
      <InputLabel id={labelId}>Theme</InputLabel>
      <Select
        label="Theme"
        labelId={labelId}
        onChange={event => {
          if (isThemeId(event.target.value)) {
            setThemeId(event.target.value);
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
