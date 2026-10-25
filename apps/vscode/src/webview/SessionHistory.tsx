import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  allLaunchTargetPhasesAtom,
  Button,
  ConfirmSessionDeleteDialog,
  OpenDeveloperPanelButton,
  refreshAllSessionRostersAtomFn,
  selectedSessionIdAtom,
  sessionListScopeAtom,
  SessionRosterRow,
  sessionsForCwd,
  unifiedSessionRosterAtom,
  useSessionDeleteRequest,
} from '@lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { RotateCwIcon, SettingsIcon } from 'lucide-react';
import { useContext } from 'react';
import type { FC } from 'react';

import { CreateVirtualSessionButton } from './CreateVirtualSessionButton.tsx';
import { OnClientErrorContext } from './onClientError.tsx';
import { sessionCwdAtom } from './workspaceFolderPaths.atoms.ts';

export const SessionHistory: FC = () => {
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const backendPhases = useAtomValue(allLaunchTargetPhasesAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);
  const refreshAllSessionRosters = useAtomSet(refreshAllSessionRostersAtomFn, { mode: 'promise' });
  const navigate = useNavigate();
  const onClientError = useContext(OnClientErrorContext);
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(onClientError);

  const noFolder = sessionCwd === undefined || listScope._tag === 'Skip';
  const anyReady = backendPhases.some(entry => entry.phase === 'ready');
  // Providers may ignore sessions/list cwd; group/sort like desktop, show only this workspace.
  const sessions = sessionsForCwd(roster, sessionCwd);

  return (
    <div className="flex min-h-0 flex-col gap-2 p-2">
      <div className="flex items-center gap-1">
        <h2 className="text-base font-semibold">Session History</h2>
        <Button
          aria-label="Reload sessions"
          disabled={noFolder || !anyReady}
          onClick={() => {
            refreshAllSessionRosters(undefined).catch(onClientError);
          }}
          size="icon-sm"
          variant="ghost"
        >
          <RotateCwIcon />
        </Button>
        <div className="flex-1" />
        <OpenDeveloperPanelButton />
        <CreateVirtualSessionButton disabled={noFolder} />
        <Button
          aria-label="Settings"
          onClick={() => {
            navigate({ to: '/settings' }).catch(() => undefined);
          }}
          size="icon-sm"
          variant="ghost"
        >
          <SettingsIcon />
        </Button>
      </div>

      {noFolder ? (
        <p className="text-sm text-muted-foreground">Open a workspace folder to create and list sessions.</p>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col gap-2 p-2">
          <p className="text-sm text-muted-foreground">
            {anyReady
              ? 'No sessions yet. Create one to get started.'
              : 'No sessions yet. Configure a provider before creating a session.'}
          </p>
          {!anyReady ? (
            <Button
              className="self-start"
              onClick={() => {
                navigate({ to: '/settings' }).catch(() => undefined);
              }}
              size="sm"
              variant="outline"
            >
              Open Settings
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-auto py-1">
          {sessions.map(entry => (
            <SessionRosterRow
              entry={entry}
              key={`${entry.launchTarget}:${entry.sessionId}`}
              onClientError={onClientError}
              onDeleteRequest={requestDelete}
              selected={selectedSessionId === entry.sessionId}
            />
          ))}
        </div>
      )}

      <ConfirmSessionDeleteDialog onCancel={clearDeleteTarget} onClientError={onClientError} target={deleteTarget} />
    </div>
  );
};
