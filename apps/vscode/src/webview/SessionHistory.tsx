import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  allLaunchTargetPhasesAtom,
  ConfirmSessionDeleteDialog,
  ensureVirtualSessionAtomFn,
  OpenDeveloperPanelButton,
  refreshAllSessionRostersAtomFn,
  selectedSessionIdAtom,
  sessionListScopeAtom,
  SessionRosterRow,
  sessionsForCwd,
  unifiedSessionRosterAtom,
  useSessionDeleteRequest,
} from '@lib/ui';
import Add from '@mui/icons-material/Add';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate } from '@tanstack/react-router';
import { useContext } from 'react';
import type { FC } from 'react';

import { OnClientErrorContext } from './onClientError.tsx';
import { sessionCwdAtom } from './workspaceFolderPaths.atoms.ts';

export const SessionHistory: FC = () => {
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const backendPhases = useAtomValue(allLaunchTargetPhasesAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);
  const refreshAllSessionRosters = useAtomSet(refreshAllSessionRostersAtomFn, { mode: 'promise' });
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const navigate = useNavigate();
  const onClientError = useContext(OnClientErrorContext);
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);

  const noFolder = sessionCwd === undefined || listScope._tag === 'Skip';
  const anyReady = backendPhases.some(entry => entry.phase === 'ready');
  // Providers may ignore sessions/list cwd; group/sort like desktop, show only this workspace.
  const sessions = sessionsForCwd(roster, sessionCwd);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0, p: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
        <Typography sx={{ fontWeight: 600 }} variant="subtitle1">
          Session History
        </Typography>
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
        <Box sx={{ flex: 1 }} />
        <OpenDeveloperPanelButton />
        <IconButton
          aria-label="Create session"
          disabled={noFolder}
          onClick={() => {
            if (sessionCwd === undefined) {
              return;
            }
            ensureVirtualSession({ cwd: sessionCwd }).catch(onClientError);
          }}
          size="small"
        >
          <Add fontSize="small" />
        </IconButton>
        <IconButton
          aria-label="Settings"
          onClick={() => {
            navigate({ to: '/settings' }).catch(() => undefined);
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
                navigate({ to: '/settings' }).catch(() => undefined);
              }}
              size="small"
              variant="outlined"
            >
              Open Settings
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

      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} onClientError={onClientError} target={deleteTarget} />
    </Box>
  );
};
