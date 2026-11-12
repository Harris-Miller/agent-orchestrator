import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { AsyncResult } from 'effect/reactivity';
import { useState } from 'react';
import type { FC } from 'react';

import {
  alwaysHiddenGlobsAtom,
  appOrchestratedHandoffAtom,
  confirmSessionDeleteAtom,
  developerModeAtom,
  keepAwakeEnabledAtom,
  keepAwakeSupportedAtom,
  midTurnSendAtom,
  notificationsEnabledAtom,
  notificationSoundEnabledAtom,
  notifierSupportedAtom,
  notifyOnlyWhenUnfocusedAtom,
  showEmptyCwdGroupsAtom,
  showNoFolderGroupAtom,
  userSettingsAtom,
} from '../atoms/boundHarnessAtoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';
import type { MidTurnSend } from '../atoms/userSettings/userSettings.atoms.ts';

import { SettingsRow, SettingsSection } from './SettingsSection.tsx';

/** Settings → General: User settings toggles shared across hosts. */
export const GeneralSettingsPane: FC = () => {
  const settingsResult = useAtomValue(userSettingsAtom);
  const confirmSessionDelete = useAtomValue(confirmSessionDeleteAtom);
  const setConfirmSessionDelete = useAtomSet(confirmSessionDeleteAtom);
  const appOrchestratedHandoff = useAtomValue(appOrchestratedHandoffAtom);
  const setAppOrchestratedHandoff = useAtomSet(appOrchestratedHandoffAtom);
  const developerMode = useAtomValue(developerModeAtom);
  const setDeveloperMode = useAtomSet(developerModeAtom);
  const showNoFolderGroup = useAtomValue(showNoFolderGroupAtom);
  const setShowNoFolderGroup = useAtomSet(showNoFolderGroupAtom);
  const midTurnSend = useAtomValue(midTurnSendAtom);
  const setMidTurnSend = useAtomSet(midTurnSendAtom);
  const showEmptyCwdGroups = useAtomValue(showEmptyCwdGroupsAtom);
  const setShowEmptyCwdGroups = useAtomSet(showEmptyCwdGroupsAtom);
  const notificationsOn = useAtomValue(notificationsEnabledAtom);
  const setNotificationsOn = useAtomSet(notificationsEnabledAtom);
  const notificationSoundOn = useAtomValue(notificationSoundEnabledAtom);
  const setNotificationSoundOn = useAtomSet(notificationSoundEnabledAtom);
  const notifyOnlyWhenUnfocused = useAtomValue(notifyOnlyWhenUnfocusedAtom);
  const setNotifyOnlyWhenUnfocused = useAtomSet(notifyOnlyWhenUnfocusedAtom);
  const notifierSupported = useAtomValue(notifierSupportedAtom);
  const keepAwakeOn = useAtomValue(keepAwakeEnabledAtom);
  const setKeepAwakeOn = useAtomSet(keepAwakeEnabledAtom);
  const keepAwakeSupported = AsyncResult.getOrElse(useAtomValue(keepAwakeSupportedAtom), () => true);
  const alwaysHiddenGlobs = useAtomValue(alwaysHiddenGlobsAtom);
  const setAlwaysHiddenGlobs = useAtomSet(alwaysHiddenGlobsAtom);
  /** Draft text so Enter can open a new line; atom normalize runs on blur. */
  const [alwaysHiddenGlobsDraft, setAlwaysHiddenGlobsDraft] = useState<string | undefined>(undefined);
  const alwaysHiddenGlobsText = alwaysHiddenGlobsDraft ?? alwaysHiddenGlobs.join('\n');
  const editsDisabled = userSettingsEditsDisabled(settingsResult);

  return (
    <Stack spacing={1}>
      <SettingsSection title="Sessions">
        <SettingsRow
          title="Confirm before deleting a session"
          description="Ask for confirmation before permanently deleting a session."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Confirm before deleting a session' } }}
            checked={confirmSessionDelete}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setConfirmSessionDelete(checked);
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="Show No Folder group in Sessions"
          description="Include sessions without a folder in the session list."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Show No Folder group in Sessions' } }}
            checked={showNoFolderGroup}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setShowNoFolderGroup(checked);
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="Send while an agent is working"
          description="Steer sends your message into the running turn. Queue holds it and sends it when the turn ends. The Send options menu offers the other one. Only for agents that support steering."
        >
          <ToggleButtonGroup
            aria-label="Send while an agent is working"
            disabled={editsDisabled}
            exclusive
            onChange={(_event, value: MidTurnSend | null) => {
              if (value !== null) {
                setMidTurnSend(value);
              }
            }}
            size="small"
            value={midTurnSend}
          >
            <ToggleButton value="steer">Steer</ToggleButton>
            <ToggleButton value="queue">Queue</ToggleButton>
          </ToggleButtonGroup>
        </SettingsRow>
        <SettingsRow
          title="Show empty folders in Sessions"
          description="Keep folders you have used in Session History after their sessions are deleted or archived."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Show empty folders in Sessions' } }}
            checked={showEmptyCwdGroups}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setShowEmptyCwdGroups(checked);
            }}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Notifications">
        <SettingsRow title="Notifications" description="Notify you when an agent needs attention.">
          <Switch
            slotProps={{ input: { 'aria-label': 'Notifications' } }}
            checked={notificationsOn}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setNotificationsOn(checked);
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="Notification sound"
          description="Play a sound with notifications when supported by this host."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Notification sound' } }}
            checked={notificationSoundOn}
            disabled={editsDisabled || !notificationsOn}
            onChange={(_event, checked) => {
              setNotificationSoundOn(checked);
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="Only notify when window unfocused"
          description="Suppress notifications while you are using this window."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Only notify when window unfocused' } }}
            checked={notifyOnlyWhenUnfocused}
            disabled={editsDisabled || !notificationsOn}
            onChange={(_event, checked) => {
              setNotifyOnlyWhenUnfocused(checked);
            }}
          />
        </SettingsRow>
        {AsyncResult.getOrElse(notifierSupported, () => 'os') === 'in-app' ? (
          <Typography color="text.secondary" variant="body2">
            This host shows notifications inside the editor only; there is no OS notification or sound.
          </Typography>
        ) : null}
      </SettingsSection>
      <SettingsSection title="System">
        <SettingsRow
          title="Keep computer awake while agents work"
          description={
            keepAwakeSupported
              ? 'Prevents idle sleep while a prompt turn runs. The display can still sleep, and closing the lid still sleeps the computer.'
              : 'Not supported on this platform'
          }
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Keep computer awake while agents work' } }}
            checked={keepAwakeSupported && keepAwakeOn}
            disabled={editsDisabled || !keepAwakeSupported}
            onChange={(_event, checked) => {
              setKeepAwakeOn(checked);
            }}
          />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Advanced">
        <SettingsRow
          title="Experimental: App Orchestrated Handoff"
          description="Adds Handoff to the Send options menu. The source agent delivers its handoff document by calling a tool on a local MCP hub that HOA runs. Starts the hub, and needs Node.js 22 or later. Sessions opened before you turn this on must be reopened to use it."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Experimental: App Orchestrated Handoff' } }}
            checked={appOrchestratedHandoff}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setAppOrchestratedHandoff(checked);
            }}
          />
        </SettingsRow>
        <SettingsRow title="Developer mode" description="Show developer tools and diagnostic panels.">
          <Switch
            slotProps={{ input: { 'aria-label': 'Developer mode' } }}
            checked={developerMode}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setDeveloperMode(checked);
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="Always-hidden globs"
          description="One glob per line. Applied to directory picking and @ mentions even when Show hidden is on. .git is always excluded."
          below={
            <TextField
              disabled={editsDisabled}
              fullWidth
              id="always-hidden-globs"
              slotProps={{ htmlInput: { 'aria-label': 'Always-hidden globs' } }}
              minRows={3}
              multiline
              onBlur={() => {
                setAlwaysHiddenGlobs(alwaysHiddenGlobsText.split('\n'));
                setAlwaysHiddenGlobsDraft(undefined);
              }}
              onChange={event => {
                setAlwaysHiddenGlobsDraft(event.target.value);
              }}
              value={alwaysHiddenGlobsText}
            />
          }
        />
      </SettingsSection>
    </Stack>
  );
};
