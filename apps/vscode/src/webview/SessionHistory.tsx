import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  enabledLaunchTargetPhasesAtom,
  IconTooltipButton,
  isUsablePhase,
  PANEL_HEADER_HEIGHT,
  pinnedEntriesAtom,
  refreshAllSessionHistoriesAtomFn,
  selectedSessionIdAtom,
  sessionCwdAtom,
  sessionListScopeAtom,
  sessionsForCwd,
  ShowArchivedToggle,
  ToggleDeveloperPanelButton,
  unifiedSessionHistoryAtom,
  useSessionHistorySearch,
  visibleSessionHistoryAtom,
} from '@lib/ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { RotateCw } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useContext } from 'react';
import type { FC } from 'react';

import { CreateVirtualSessionButton } from './CreateVirtualSessionButton.tsx';
import { OnClientErrorContext } from './onClientError.tsx';
import { SessionRows } from './SessionRows.tsx';
import { SettingsButton } from './SettingsButton.tsx';

export const SessionHistory: FC = () => {
  const history = useAtomValue(visibleSessionHistoryAtom);
  const unifiedHistory = useAtomValue(unifiedSessionHistoryAtom);
  const pinnedAll = useAtomValue(pinnedEntriesAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const backendPhases = useAtomValue(enabledLaunchTargetPhasesAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);
  const refreshAllSessionHistories = useAtomSet(refreshAllSessionHistoriesAtomFn, { mode: 'promise' });
  const navigate = useNavigate();
  const onClientError = useContext(OnClientErrorContext);

  const noFolder = sessionCwd === undefined || listScope._tag === 'Skip';
  const search = useSessionHistorySearch({
    entries: sessionsForCwd(unifiedHistory, sessionCwd),
    scope: sessionCwd,
    disabled: noFolder,
    onClientError,
    selectedSessionId,
  });
  const anyUsable = backendPhases.some(entry => isUsablePhase(entry.phase));
  // Providers may ignore sessions/list cwd; group/sort like desktop, show only this workspace.
  const workspaceSessions = sessionsForCwd(history, sessionCwd);
  const pinnedSessions = sessionsForCwd(pinnedAll, sessionCwd);
  const pinnedKeys = new Set(pinnedSessions.map(entry => `${entry.launchTarget}:${entry.sessionId}`));
  const sessions = workspaceSessions.filter(entry => !pinnedKeys.has(`${entry.launchTarget}:${entry.sessionId}`));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%', minHeight: 0, px: 1, pb: 1 }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 0.5, height: PANEL_HEADER_HEIGHT, flexShrink: 0, boxSizing: 'border-box' }}
      >
        <Typography sx={{ fontWeight: 600 }} variant="subtitle1">
          Session History
        </Typography>
        <Box sx={{ flex: 1 }} />
        <ShowArchivedToggle />
        <IconTooltipButton
          icon={RotateCw}
          label="Reload sessions"
          disabled={noFolder || !anyUsable}
          onClick={() => {
            refreshAllSessionHistories(undefined).catch(onClientError);
          }}
        />
        <ToggleDeveloperPanelButton />
        <CreateVirtualSessionButton disabled={noFolder} />
        <SettingsButton />
      </Stack>

      {search.field}
      {noFolder ? (
        <Typography color="text.secondary" variant="body2">
          Open a workspace folder to create and list sessions.
        </Typography>
      ) : search.active ? (
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{search.results}</Box>
      ) : workspaceSessions.length === 0 ? (
        <Stack spacing={1} sx={{ p: 1 }}>
          <Typography color="text.secondary" variant="body2">
            {anyUsable
              ? 'No sessions yet. Create one to get started.'
              : 'No sessions yet. Configure a provider before creating a session.'}
          </Typography>
          {!anyUsable ? (
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
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', py: 0.5 }}>
          <SessionRows pinnedSessions={pinnedSessions} selectedSessionId={selectedSessionId} sessions={sessions} />
        </Box>
      )}
    </Box>
  );
};
