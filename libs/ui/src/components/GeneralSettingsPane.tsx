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
  appOrchestratedAgentsAtom,
  confirmSessionDeleteAtom,
  developerModeAtom,
  keepAwakeEnabledAtom,
  keepAwakeSupportedAtom,
  midTurnSendAtom,
  notificationsEnabledAtom,
  notificationSoundEnabledAtom,
  notifierSupportedAtom,
  notifyOnlyWhenUnfocusedAtom,
  userSettingsAtom,
  workstreamsSettingAtom,
} from '../atoms/boundHarnessAtoms.ts';
import { userSettingsEditsDisabled } from '../atoms/userSettings/userSettings.atoms.ts';
import type { MidTurnSend } from '../atoms/userSettings/userSettings.atoms.ts';

import { SettingsRow, SettingsSection } from './SettingsSection.tsx';

/** Settings → General: User settings toggles shared across hosts. */
export const GeneralSettingsPane: FC = () => {
  const settingsResult = useAtomValue(userSettingsAtom);
  const confirmSessionDelete = useAtomValue(confirmSessionDeleteAtom);
  const setConfirmSessionDelete = useAtomSet(confirmSessionDeleteAtom);
  const appOrchestratedAgents = useAtomValue(appOrchestratedAgentsAtom);
  const setAppOrchestratedAgents = useAtomSet(appOrchestratedAgentsAtom);
  const workstreams = useAtomValue(workstreamsSettingAtom);
  const setWorkstreams = useAtomSet(workstreamsSettingAtom);
  const developerMode = useAtomValue(developerModeAtom);
  const setDeveloperMode = useAtomSet(developerModeAtom);
  const midTurnSend = useAtomValue(midTurnSendAtom);
  const setMidTurnSend = useAtomSet(midTurnSendAtom);
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
          title="Send while an agent is working"
          description="Steer sends your message into the running turn. Queue holds it and sends it when the turn ends. While Steering is offered, a second button beside Send offers the other one. Only for agents that support steering."
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
          description="Play a sound when an agent needs you. With Notifications on, it plays with the notification; with Notifications off, the app plays it."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Notification sound' } }}
            checked={notificationSoundOn}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setNotificationSoundOn(checked);
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="Only notify when window unfocused"
          description="Suppress notifications and sounds while you are using this window."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Only notify when window unfocused' } }}
            checked={notifyOnlyWhenUnfocused}
            disabled={editsDisabled || (!notificationsOn && !notificationSoundOn)}
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
          title="Experimental: App Orchestrated Agents"
          description="Adds a Handoff button to the Session actions strip above the Composer, and lets agents start subagents on other providers. Agents call tools on a local MCP hub that HOA runs (a handoff document is delivered this way). Starts the hub, and needs Node.js 22 or later. Changing this restarts the providers of your active sessions and reopens those sessions, which cancels any turn running in them."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Experimental: App Orchestrated Agents' } }}
            checked={appOrchestratedAgents}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setAppOrchestratedAgents(checked);
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="Experimental: Workstreams"
          description="Adds a Workstreams page: group sessions into Workstreams that follow external work items. Sessions in a Workstream leave the Sessions page while this is on."
        >
          <Switch
            slotProps={{ input: { 'aria-label': 'Experimental: Workstreams' } }}
            checked={workstreams}
            disabled={editsDisabled}
            onChange={(_event, checked) => {
              setWorkstreams(checked);
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
