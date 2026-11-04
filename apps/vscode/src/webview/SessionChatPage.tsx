import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  activateSessionAtomFn,
  AgentLaunchTargetIcon,
  clearSelectedAtomFn,
  ConfirmSessionDeleteDialog,
  ensureVirtualSessionAtomFn,
  IconTooltipButton,
  isSessionActiveOrActivating,
  selectedAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  SessionActionsMenu,
  SessionChatBody,
  sessionChatTitle,
  sessionCwdAtom,
  sessionListScopeAtom,
  SessionTitleInlineRename,
  ToggleDeveloperPanelButton,
  unifiedSessionHistoryAtom,
  useSessionDeleteRequest,
  virtualLifecycleInFlightAtom,
  virtualSessionAtom,
} from '@lib/ui';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { History } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

import { CreateVirtualSessionButton } from './CreateVirtualSessionButton.tsx';
import { OnClientErrorContext } from './onClientError.tsx';
import { RecentSessions } from './RecentSessions.tsx';
import { SettingsButton } from './SettingsButton.tsx';

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
  const history = useAtomValue(unifiedSessionHistoryAtom);
  const inFlight = useAtomValue(virtualLifecycleInFlightAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const clearSelected = useAtomSet(clearSelectedAtomFn, { mode: 'promise' });
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const onClientError = useContext(OnClientErrorContext);
  const [renaming, setRenaming] = useState(false);
  const noFolder = sessionCwd === undefined || listScope._tag === 'Skip';
  /** One activate kick per sessionId until status leaves inactive (avoids effect re-entry storms). */
  const activateKickRef = useRef<string | undefined>(undefined);
  const activateSessionRef = useRef(activateSession);

  useEffect(() => {
    activateSessionRef.current = activateSession;
  }, [activateSession]);

  // Deactivate/Archive/Delete of this session: switch to the Virtual session first so the lifecycle atoms don't clear Selected.
  const switchToVirtualSession = () => {
    if (sessionCwd !== undefined) {
      ensureVirtualSession({ cwd: sessionCwd }).catch(onClientError);
    }
  };
  const { clearDeleteTarget, deleteTarget, requestDelete } = useSessionDeleteRequest(
    onClientError,
    switchToVirtualSession,
  );

  const isVirtual = selected?._tag === 'Virtual';
  const launchTarget = isVirtual ? virtualSession?.launchTarget : selectedSessionLaunchTarget;
  const sessionId = selectedSessionId;
  const status = selectedSession?.status ?? 'inactive';
  const entry = sessionId === undefined ? undefined : history.find(row => row.sessionId === sessionId);
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
    activateKickRef.current = undefined;
    clearSelected(undefined).catch(() => undefined);
  };

  return (
    <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, gap: 0.5, px: 1, py: 0.5 }}>
        {launchTarget === undefined ? null : <AgentLaunchTargetIcon launchTarget={launchTarget} />}
        {entry === undefined ? (
          <Typography noWrap sx={{ flex: 1, fontWeight: 600 }} variant="subtitle1">
            {title}
          </Typography>
        ) : (
          <>
            <SessionTitleInlineRename
              editing={renaming}
              entry={entry}
              onClientError={onClientError}
              onEditingChange={setRenaming}
            >
              <Typography noWrap sx={{ fontWeight: 600 }} variant="subtitle1">
                {title}
              </Typography>
            </SessionTitleInlineRename>
            <SessionActionsMenu
              entry={entry}
              onBeforeAction={switchToVirtualSession}
              onClientError={onClientError}
              onDeleteRequest={requestDelete}
              onRenameRequest={() => {
                setRenaming(true);
              }}
            />
          </>
        )}
        <ToggleDeveloperPanelButton />
        <CreateVirtualSessionButton disabled={noFolder || inFlight} />
        <SettingsButton />
        <IconTooltipButton icon={History} label="Session History" onClick={onBack} />
      </Stack>
      <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <SessionChatBody onClientError={onClientError} virtualEmptyState={<RecentSessions />} />
      </Box>
      <ConfirmSessionDeleteDialog
        onBeforeDelete={switchToVirtualSession}
        onCancel={clearDeleteTarget}
        onClientError={onClientError}
        target={deleteTarget}
      />
    </Box>
  );
};
