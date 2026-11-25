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
import type { ThemeId } from '../theme/themes.ts';

/** What differs between the two palette pickers. */
type SlotConfig = {
  readonly atom: typeof lightThemeAtom;
  readonly guard: (value: unknown) => value is ThemeId;
  readonly ids: readonly ThemeId[];
  readonly label: string;
};

const SLOT_CONFIG: Record<Slot, SlotConfig> = {
  dark: { atom: darkThemeAtom, guard: isDarkThemeId, ids: DARK_THEME_IDS, label: 'Dark theme' },
  light: { atom: lightThemeAtom, guard: isLightThemeId, ids: LIGHT_THEME_IDS, label: 'Light theme' },
};

/** Palette picker for one slot in Settings Appearance: lists only palettes of that slot's mode. */
export const ThemeSelect: FC<{ readonly disabled?: boolean; readonly slot: Slot }> = ({ disabled = false, slot }) => {
  const { atom, guard, ids, label } = SLOT_CONFIG[slot];
  const themeId = useAtomValue(atom);
  const setTheme = useAtomSet(atom);
  const editable = !userSettingsEditsDisabled(useAtomValue(userSettingsAtom));

  return (
    <FormControl disabled={disabled || !editable} size="small" sx={{ minWidth: 180 }}>
      <Select
        slotProps={{ input: { 'aria-label': label } }}
        onChange={event => {
          const { value } = event.target;
          if (guard(value)) {
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
