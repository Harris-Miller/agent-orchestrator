import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { isThemeId, THEME_IDS, themeAtom, userSettingsAtom, userSettingsEditsDisabled } from '@lib/ui';
import type { ThemeId } from '@lib/ui';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { FC } from 'react';

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
