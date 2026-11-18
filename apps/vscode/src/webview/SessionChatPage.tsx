import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  activateSessionAtomFn,
  clearSelectedAtomFn,
  ensureVirtualSessionAtomFn,
  IconTooltipButton,
  isSessionActiveOrActivating,
  PANEL_HEADER_HEIGHT,
  selectedAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  SessionChatBody,
  sessionCwdAtom,
  SessionHeader,
  sessionListScopeAtom,
  ToggleDeveloperPanelButton,
  virtualMaterializingAtom,
} from '@lib/ui';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { History } from 'lucide-react';
import { useContext, useEffect, useRef } from 'react';
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
  const inFlight = useAtomValue(virtualMaterializingAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const clearSelected = useAtomSet(clearSelectedAtomFn, { mode: 'promise' });
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });
  const onClientError = useContext(OnClientErrorContext);
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

  const isVirtual = selected?._tag === 'Virtual';
  const sessionId = selectedSessionId;
  const status = selectedSession?.status ?? 'inactive';

  useEffect(() => {
    if (isVirtual) {
      activateKickRef.current = undefined;
      return;
    }

    if (sessionId === undefined || selectedSessionLaunchTarget === undefined) {
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
    activateSessionRef.current({ launchTarget: selectedSessionLaunchTarget, sessionId }).catch(onClientError);
  }, [clearSelected, isVirtual, onClientError, selectedSessionLaunchTarget, sessionId, status]);

  const onBack = () => {
    activateKickRef.current = undefined;
    clearSelected(undefined).catch(() => undefined);
  };

  return (
    <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          flexShrink: 0,
          gap: 0.5,
          px: 1,
          height: PANEL_HEADER_HEIGHT,
          boxSizing: 'border-box',
        }}
      >
        <SessionHeader
          onBeforeAction={switchToVirtualSession}
          onClientError={onClientError}
          titleProps={{ sx: { fontWeight: 600 }, variant: 'subtitle1' }}
        />
        {!isVirtual && <CreateVirtualSessionButton disabled={noFolder || inFlight} />}
        <SettingsButton />
        <IconTooltipButton icon={History} label="Session History" onClick={onBack} />
        <ToggleDeveloperPanelButton />
      </Stack>
      <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <SessionChatBody onClientError={onClientError} virtualEmptyState={<RecentSessions />} />
      </Box>
    </Box>
  );
};
