import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Switch from '@mui/material/Switch';
import type { FC } from 'react';

import { matchVscodeThemeAtom, userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { hostThemeAtom } from '../atoms/theme.atoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';

import { SettingsRow, SettingsSection } from './SettingsSection.tsx';
import { ThemeSelect } from './ThemeSelect.tsx';

/** Settings → Appearance: Theme preference, plus Match VS Code theme where the Host supplies a theme. */
export const AppearanceSettingsPane: FC = () => {
  const hostTheme = useAtomValue(hostThemeAtom);
  const matchVscodeTheme = useAtomValue(matchVscodeThemeAtom);
  const setMatchVscodeTheme = useAtomSet(matchVscodeThemeAtom);
  const editsDisabled = userSettingsEditsDisabled(useAtomValue(userSettingsAtom));
  const hostThemeInUse = hostTheme !== undefined && matchVscodeTheme;

  return (
    <SettingsSection title="Appearance">
      <SettingsRow
        title="Theme"
        description={
          hostThemeInUse
            ? 'Colors follow your VS Code theme. This now only picks the file-icon set.'
            : 'Choose the colors used throughout the app.'
        }
      >
        <ThemeSelect />
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
