import { useAtomSet, useAtomValue } from '@effect/atom-react';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { ThemeProvider } from '@mui/material/styles';
import { useEffect, useMemo } from 'react';
import type { FC, ReactNode } from 'react';

import { settingsHydratedAtom, userSettingsAtom, writeUserSettingsAtomFn } from '../atoms/index.ts';

import { THEME_IDS, THEME_LABELS, themes } from './theme.ts';
import type { ThemeId } from './theme.ts';
import { ThemeChoiceContext, useThemeChoice } from './themeChoiceContext.ts';
import { clampThemeId, isThemeId, readPaintThemeId, writePaintThemeId } from './themePaintCache.ts';

/** First-paint cache read once at module load (before Settings hydrate). */
const initialPaintThemeId = readPaintThemeId();

export const AppThemeProvider: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const settings = useAtomValue(userSettingsAtom);
  const hydrated = useAtomValue(settingsHydratedAtom);
  const writeUserSettings = useAtomSet(writeUserSettingsAtomFn, { mode: 'promise' });
  const themeId = hydrated ? clampThemeId(settings.theme) : initialPaintThemeId;

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    writePaintThemeId(clampThemeId(settings.theme));
  }, [hydrated, settings.theme]);

  const value = useMemo(
    () => ({
      setThemeId: (id: ThemeId) => {
        writePaintThemeId(id);
        writeUserSettings({ ...settings, theme: id }).catch(() => undefined);
      },
      themeId,
    }),
    [settings, themeId, writeUserSettings],
  );

  return (
    <ThemeChoiceContext.Provider value={value}>
      <ThemeProvider noSsr theme={themes[themeId]}>
        {children}
      </ThemeProvider>
    </ThemeChoiceContext.Provider>
  );
};

/** Theme preference control for the Settings Appearance pane. */
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
