import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  activateSessionAtomFn,
  agentLaunchTargetLabel,
  isSessionActiveOrActivating,
  OpenDeveloperPanelButton,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  SessionChatBody,
  unifiedSessionRosterAtom,
} from '@lib/ui';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useContext, useEffect, useRef } from 'react';
import type { FC } from 'react';

import { OnClientErrorContext } from './onClientError.tsx';

/**
 * Chat chrome for the Selected session. Parent only mounts this when
 * `selectedSessionIdAtom` is defined; back clears Selected → Session History.
 */
export const SessionChatPage: FC = () => {
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const setSelectedSessionId = useAtomSet(selectedSessionIdAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const launchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const onClientError = useContext(OnClientErrorContext);
  /** One activate kick per sessionId until status leaves inactive (avoids effect re-entry storms). */
  const activateKickRef = useRef<string | undefined>(undefined);
  const activateSessionRef = useRef(activateSession);

  useEffect(() => {
    activateSessionRef.current = activateSession;
  }, [activateSession]);

  const sessionId = selectedSessionId;
  const status = selectedSession?.status ?? 'inactive';
  const entry = sessionId === undefined ? undefined : roster.find(row => row.sessionId === sessionId);
  const title =
    entry === undefined
      ? 'Chat'
      : (entry.title ?? (launchTarget === undefined ? 'Chat' : agentLaunchTargetLabel(launchTarget)));

  useEffect(() => {
    if (sessionId === undefined || launchTarget === undefined) {
      activateKickRef.current = undefined;
      setSelectedSessionId(undefined);
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
  }, [launchTarget, onClientError, sessionId, setSelectedSessionId, status]);

  const onBack = () => {
    activateKickRef.current = undefined;
    setSelectedSessionId(undefined);
  };

  return (
    <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, gap: 0.5, px: 1, py: 0.5 }}>
        <IconButton aria-label="Back to Session History" onClick={onBack} size="small">
          <ArrowBack fontSize="small" />
        </IconButton>
        <Typography noWrap sx={{ flex: 1, fontWeight: 600 }} variant="subtitle1">
          {title}
        </Typography>
        <OpenDeveloperPanelButton />
      </Stack>
      <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <SessionChatBody onClientError={onClientError} />
      </Box>
    </Box>
  );
};
