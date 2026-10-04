import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { AgentLaunchTarget } from '@lib/ui';
import {
  AgentLaunchTargetMenu,
  allLaunchTargetPhasesAtom,
  ConfirmSessionDeleteDialog,
  createSessionAtomFn,
  developerModeAtom,
  OpenDeveloperPanelButton,
  ProvidersSettingsPane,
  refreshAllSessionRostersAtomFn,
  selectedSessionIdAtom,
  sessionListScopeAtom,
  SessionRosterRow,
  sessionsForCwd,
  unifiedSessionRosterAtom,
  userSettingsAtom,
  userSettingsEditsDisabled,
  useSessionDeleteRequest,
} from '@lib/ui';
import Add from '@mui/icons-material/Add';
import ArrowBack from '@mui/icons-material/ArrowBack';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useContext, useState } from 'react';
import type { FC, MouseEvent } from 'react';

import { OnClientErrorContext } from './onClientError.tsx';
import { sessionCwdAtom } from './workspaceFolderPaths.atoms.ts';

export const SessionHistory: FC = () => {
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const backendPhases = useAtomValue(allLaunchTargetPhasesAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);
  const refreshAllSessionRosters = useAtomSet(refreshAllSessionRostersAtomFn, { mode: 'promise' });
  const createSession = useAtomSet(createSessionAtomFn, { mode: 'promise' });
  const navigate = useNavigate();
  const onClientError = useContext(OnClientErrorContext);
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);
  const [createMenuAnchor, setCreateMenuAnchor] = useState<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);

  const noFolder = sessionCwd === undefined || listScope._tag === 'Skip';
  const anyReady = backendPhases.some(entry => entry.phase === 'ready');
  // Providers may ignore sessions/list cwd; group/sort like desktop, show only this workspace.
  const sessions = sessionsForCwd(roster, sessionCwd);

  const createWithAgent = (launchTarget: AgentLaunchTarget) => {
    if (sessionCwd === undefined || creating) {
      return;
    }
    setCreating(true);
    setCreateMenuAnchor(null);
    // createSession selects the new session → SessionHome shows Chat.
    createSession({ cwd: sessionCwd, launchTarget })
      .catch(onClientError)
      .finally(() => {
        setCreating(false);
      });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0, p: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ flex: 1, fontWeight: 600 }} variant="subtitle1">
          Session History
        </Typography>
        <OpenDeveloperPanelButton />
        <IconButton
          aria-label="Create session"
          disabled={noFolder || creating}
          onClick={(event: MouseEvent<HTMLElement>) => {
            setCreateMenuAnchor(event.currentTarget);
          }}
          size="small"
        >
          <Add fontSize="small" />
        </IconButton>
        <IconButton
          aria-label="Reload sessions"
          disabled={noFolder || !anyReady}
          onClick={() => {
            refreshAllSessionRosters(undefined).catch(onClientError);
          }}
          size="small"
        >
          <Typography component="span" sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
            ↻
          </Typography>
        </IconButton>
        <IconButton
          aria-label="Providers"
          onClick={() => {
            navigate({ to: '/providers' }).catch(() => undefined);
          }}
          size="small"
        >
          <SettingsOutlined fontSize="small" />
        </IconButton>
      </Stack>

      {noFolder ? (
        <Typography color="text.secondary" variant="body2">
          Open a workspace folder to create and list sessions.
        </Typography>
      ) : sessions.length === 0 ? (
        <Stack spacing={1} sx={{ p: 1 }}>
          <Typography color="text.secondary" variant="body2">
            {anyReady
              ? 'No sessions yet. Create one to get started.'
              : 'No sessions yet. Configure a provider before creating a session.'}
          </Typography>
          {!anyReady ? (
            <Button
              onClick={() => {
                navigate({ to: '/providers' }).catch(() => undefined);
              }}
              size="small"
              variant="outlined"
            >
              Open Providers
            </Button>
          ) : null}
        </Stack>
      ) : (
        <Box sx={{ overflow: 'auto', py: 0.5 }}>
          {sessions.map(entry => (
            <SessionRosterRow
              entry={entry}
              key={`${entry.launchTarget}:${entry.sessionId}`}
              onClientError={onClientError}
              onDeleteRequest={requestDelete}
              selected={selectedSessionId === entry.sessionId}
            />
          ))}
        </Box>
      )}

      <AgentLaunchTargetMenu
        anchorEl={createMenuAnchor}
        creating={creating}
        onClose={() => {
          setCreateMenuAnchor(null);
        }}
        onSelect={createWithAgent}
      />

      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} onClientError={onClientError} target={deleteTarget} />
    </Box>
  );
};

export const ProvidersPage: FC = () => {
  const navigate = useNavigate();
  const developerMode = useAtomValue(developerModeAtom);
  const setDeveloperMode = useAtomSet(developerModeAtom);
  const userSettings = useAtomValue(userSettingsAtom);
  const editsDisabled = userSettingsEditsDisabled(userSettings);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
        <IconButton
          aria-label="Back to Session History"
          onClick={() => {
            navigate({ to: '/' }).catch(() => undefined);
          }}
          size="small"
        >
          <ArrowBack fontSize="small" />
        </IconButton>
        <Typography sx={{ flex: 1, fontWeight: 600 }} variant="subtitle1">
          Providers
        </Typography>
        <OpenDeveloperPanelButton />
      </Stack>
      <ProvidersSettingsPane />
      {/* Full Settings shell → #96 (Epic #88); not in #92. */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
        <Switch
          checked={developerMode}
          disabled={editsDisabled}
          onChange={(_event, checked) => {
            setDeveloperMode(checked);
          }}
          slotProps={{ input: { 'aria-label': 'Developer mode' } }}
        />
        <Typography variant="body1">Developer mode</Typography>
      </Stack>
    </Box>
  );
};
