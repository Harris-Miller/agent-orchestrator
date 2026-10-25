import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  activateSessionAtomFn,
  AgentLaunchTargetIcon,
  Button,
  clearSelectedAtomFn,
  isSessionActiveOrActivating,
  OpenDeveloperPanelButton,
  selectedAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  SessionChatBody,
  sessionChatTitle,
  sessionListScopeAtom,
  unifiedSessionRosterAtom,
  virtualLifecycleInFlightAtom,
  virtualSessionAtom,
} from '@lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon, SettingsIcon } from 'lucide-react';
import { useContext, useEffect, useRef } from 'react';
import type { FC } from 'react';

import { CreateVirtualSessionButton } from './CreateVirtualSessionButton.tsx';
import { OnClientErrorContext } from './onClientError.tsx';
import { sessionCwdAtom } from './workspaceFolderPaths.atoms.ts';

/**
 * Chat chrome for Virtual or Selected Session. Parent mounts when Selected is set;
 * back clears Selected → Session History (Virtual blob kept).
 */
export const SessionChatPage: FC = () => {
  const selected = useAtomValue(selectedAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const selectedSessionLaunchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const virtualSession = useAtomValue(virtualSessionAtom);
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const inFlight = useAtomValue(virtualLifecycleInFlightAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const clearSelected = useAtomSet(clearSelectedAtomFn, { mode: 'promise' });
  const navigate = useNavigate();
  const onClientError = useContext(OnClientErrorContext);
  const noFolder = sessionCwd === undefined || listScope._tag === 'Skip';
  /** One activate kick per sessionId until status leaves inactive (avoids effect re-entry storms). */
  const activateKickRef = useRef<string | undefined>(undefined);
  const activateSessionRef = useRef(activateSession);

  useEffect(() => {
    activateSessionRef.current = activateSession;
  }, [activateSession]);

  const isVirtual = selected?._tag === 'Virtual';
  const launchTarget = isVirtual ? virtualSession?.launchTarget : selectedSessionLaunchTarget;
  const sessionId = selectedSessionId;
  const status = selectedSession?.status ?? 'inactive';
  const entry = sessionId === undefined ? undefined : roster.find(row => row.sessionId === sessionId);
  const title = sessionChatTitle(isVirtual, entry, launchTarget);

  useEffect(() => {
    if (isVirtual) {
      activateKickRef.current = undefined;
      return;
    }

    if (sessionId === undefined || launchTarget === undefined) {
      activateKickRef.current = undefined;
      clearSelected(undefined).catch(() => undefined);
      return;
    }

    if (isSessionActiveOrActivating(status)) {
      activateKickRef.current = sessionId;
      return;
    }

    if (activateKickRef.current === sessionId) {
      return;
    }
    activateKickRef.current = sessionId;
    activateSessionRef.current({ launchTarget, sessionId }).catch(onClientError);
  }, [clearSelected, isVirtual, launchTarget, onClientError, sessionId, status]);

  const onBack = () => {
    if (inFlight) {
      return;
    }
    activateKickRef.current = undefined;
    clearSelected(undefined).catch(() => undefined);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 px-2 py-1">
        <Button
          aria-label="Back to Session History"
          disabled={inFlight}
          onClick={onBack}
          size="icon-sm"
          variant="ghost"
        >
          <ArrowLeftIcon />
        </Button>
        {launchTarget === undefined ? null : <AgentLaunchTargetIcon launchTarget={launchTarget} />}
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
        <OpenDeveloperPanelButton />
        <CreateVirtualSessionButton disabled={noFolder || inFlight} />
        <Button
          aria-label="Settings"
          disabled={inFlight}
          onClick={() => {
            navigate({ to: '/settings' }).catch(() => undefined);
          }}
          size="icon-sm"
          variant="ghost"
        >
          <SettingsIcon />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SessionChatBody onClientError={onClientError} />
      </div>
    </div>
  );
};
