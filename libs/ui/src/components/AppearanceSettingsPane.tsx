import { useAtomSet, useAtomValue } from '@effect/atom-react';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import { CHAT_WIDTHS } from '@lib/hoa-home';
import type { FC } from 'react';

import { chatWidthAtom, matchVscodeThemeAtom, paintedSlotAtom, userSettingsAtom } from '../atoms/boundHarnessAtoms.ts';
import { hostThemeAtom } from '../atoms/theme.atoms.ts';
import type { ChatWidth } from '../atoms/userSettings/userSettings.atoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';
import type { PaintedSlotSetting } from '../theme/themeId.ts';
import { isPaintedSlotSetting } from '../theme/themeSettings.ts';

import { SettingsRow, SettingsSection } from './SettingsSection.tsx';
import { ThemeSelect } from './ThemeSelect.tsx';

const CHAT_WIDTH_LABELS: Record<ChatWidth, string> = { comfortable: 'Comfortable', full: 'Full', wide: 'Wide' };

const PAINTED_SLOT_LABELS: Record<PaintedSlotSetting, string> = {
  dark: 'Always dark',
  light: 'Always light',
  system: 'Use system',
};

/** Settings → Appearance: Light and Dark themes, Light or dark, Chat width, plus Match VS Code theme where the Host supplies a theme. */
export const AppearanceSettingsPane: FC = () => {
  const hostTheme = useAtomValue(hostThemeAtom);
  const matchVscodeTheme = useAtomValue(matchVscodeThemeAtom);
  const setMatchVscodeTheme = useAtomSet(matchVscodeThemeAtom);
  const paintedSlot = useAtomValue(paintedSlotAtom);
  const setPaintedSlot = useAtomSet(paintedSlotAtom);
  const chatWidth = useAtomValue(chatWidthAtom);
  const setChatWidth = useAtomSet(chatWidthAtom);
  const editsDisabled = userSettingsEditsDisabled(useAtomValue(userSettingsAtom));
  const hostThemeInUse = hostTheme !== undefined && matchVscodeTheme;

  return (
    <SettingsSection title="Appearance">
      <SettingsRow
        title="Light theme"
        description={
          hostThemeInUse
            ? 'Colors follow your VS Code theme. Turn off Match VS Code theme to choose one.'
            : 'The colors used when the app is light.'
        }
      >
        <ThemeSelect disabled={hostThemeInUse} slot="light" />
      </SettingsRow>
      <SettingsRow
        title="Dark theme"
        description={
          hostThemeInUse
            ? 'Colors follow your VS Code theme. Turn off Match VS Code theme to choose one.'
            : 'The colors used when the app is dark.'
        }
      >
        <ThemeSelect disabled={hostThemeInUse} slot="dark" />
      </SettingsRow>
      {hostTheme === undefined ? (
        <SettingsRow
          title="Light or dark"
          description="Always use the light theme, always use the dark theme, or follow your system setting."
        >
          <Select
            disabled={editsDisabled}
            inputProps={{ 'aria-label': 'Light or dark' }}
            onChange={event => {
              if (isPaintedSlotSetting(event.target.value)) {
                setPaintedSlot(event.target.value);
              }
            }}
            size="small"
            value={paintedSlot}
          >
            {(['light', 'dark', 'system'] as const).map(setting => (
              <MenuItem key={setting} value={setting}>
                {PAINTED_SLOT_LABELS[setting]}
              </MenuItem>
            ))}
          </Select>
        </SettingsRow>
      ) : null}
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
          {CHAT_WIDTHS.map(width => (
            <MenuItem key={width} value={width}>
              {CHAT_WIDTH_LABELS[width]}
            </MenuItem>
          ))}
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
