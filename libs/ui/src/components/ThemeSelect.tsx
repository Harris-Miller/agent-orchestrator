import { useAtomSet, useAtomValue } from '@effect/atom-react';
import FormControl from '@mui/material/FormControl';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { FC } from 'react';

import { darkThemeAtom, lightThemeAtom, userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';
import type { Slot } from '../theme/themeId.ts';
import { isDarkThemeId, isLightThemeId } from '../theme/themeSettings.ts';
import { DARK_THEME_IDS, LIGHT_THEME_IDS, THEME_LABELS } from '../theme/themes.ts';

/** Palette picker for one slot in Settings Appearance: lists only palettes of that slot's mode. */
export const ThemeSelect: FC<{ readonly disabled?: boolean; readonly slot: Slot }> = ({ disabled = false, slot }) => {
  const isLight = slot === 'light';
  const themeId = useAtomValue(isLight ? lightThemeAtom : darkThemeAtom);
  const setTheme = useAtomSet(isLight ? lightThemeAtom : darkThemeAtom);
  const editable = !userSettingsEditsDisabled(useAtomValue(userSettingsAtom));
  const ids = isLight ? LIGHT_THEME_IDS : DARK_THEME_IDS;

  return (
    <FormControl disabled={disabled || !editable} size="small" sx={{ minWidth: 180 }}>
      <Select
        slotProps={{ input: { 'aria-label': isLight ? 'Light theme' : 'Dark theme' } }}
        onChange={event => {
          const { value } = event.target;
          if (isLight ? isLightThemeId(value) : isDarkThemeId(value)) {
            setTheme(value);
          }
        }}
        value={themeId}
      >
        {ids.map(id => (
          <MenuItem key={id} value={id}>
            {THEME_LABELS[id]}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
