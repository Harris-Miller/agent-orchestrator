import { useAtomSet, useAtomValue } from '@effect/atom-react';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import type { FC } from 'react';

import { chatWidthAtom, matchVscodeThemeAtom, userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { hostThemeAtom } from '../atoms/theme.atoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';

import { SettingsRow, SettingsSection } from './SettingsSection.tsx';
import { ThemeSelect } from './ThemeSelect.tsx';

/** Settings → Appearance: Theme preference, plus Match VS Code theme where the Host supplies a theme. */
export const AppearanceSettingsPane: FC = () => {
  const hostTheme = useAtomValue(hostThemeAtom);
  const matchVscodeTheme = useAtomValue(matchVscodeThemeAtom);
  const setMatchVscodeTheme = useAtomSet(matchVscodeThemeAtom);
  const chatWidth = useAtomValue(chatWidthAtom);
  const setChatWidth = useAtomSet(chatWidthAtom);
  const editsDisabled = userSettingsEditsDisabled(useAtomValue(userSettingsAtom));
  const hostThemeInUse = hostTheme !== undefined && matchVscodeTheme;

  return (
    <SettingsSection title="Appearance">
      <SettingsRow
        title="Theme"
        description={
          hostThemeInUse
            ? 'Colors follow your VS Code theme. Turn off Match VS Code theme to choose one.'
            : 'Choose the colors used throughout the app.'
        }
      >
        <ThemeSelect disabled={hostThemeInUse} />
      </SettingsRow>
      <SettingsRow
        title="Chat width"
        description="How wide the conversation and message box are. Comfortable keeps lines readable; Full uses the whole window."
      >
        <Select
          disabled={editsDisabled}
          inputProps={{ 'aria-label': 'Chat width' }}
          onChange={event => {
            setChatWidth(event.target.value);
          }}
          size="small"
          value={chatWidth}
        >
          <MenuItem value="comfortable">Comfortable</MenuItem>
          <MenuItem value="wide">Wide</MenuItem>
          <MenuItem value="full">Full</MenuItem>
        </Select>
      </SettingsRow>
      {hostTheme === undefined ? null : (
        <SettingsRow
          title="Match VS Code theme"
          description="Use the colors and font of your active VS Code color theme, and follow it when you switch."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Match VS Code theme' } }}
            checked={matchVscodeTheme}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setMatchVscodeTheme(checked);
            }}
          />
        </SettingsRow>
      )}
    </SettingsSection>
  );
};
