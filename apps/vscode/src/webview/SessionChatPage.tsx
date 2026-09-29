import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  activateSessionAtomFn,
  agentLaunchTargetLabel,
  backendHarnessStateAtom,
  selectedSessionIdAtom,
  selectSessionAtomFn,
  SessionChatBody,
  unifiedSessionRosterAtom,
} from '@lib/ui';
import type { AgentLaunchTarget, BackendHarnessSnapshot } from '@lib/ui';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useContext, useEffect, useRef } from 'react';
import type { FC } from 'react';

import { OnClientErrorContext } from './onClientError.tsx';

const useBackendSnapshots = (): Readonly<Record<AgentLaunchTarget, BackendHarnessSnapshot>> => {
  const claude = useAtomValue(backendHarnessStateAtom('claude-agent-acp'));
  const codex = useAtomValue(backendHarnessStateAtom('codex-acp'));
  const gemini = useAtomValue(backendHarnessStateAtom('gemini-cli'));
  return {
    'claude-agent-acp': claude,
    'codex-acp': codex,
    'gemini-cli': gemini,
  };
};

export const SessionChatPage: FC = () => {
  const { sessionId } = useParams({ from: '/session/$sessionId' });
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const setSelectedSessionId = useAtomSet(selectedSessionIdAtom);
  const selectSession = useAtomSet(selectSessionAtomFn, { mode: 'promise' });
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const snapshots = useBackendSnapshots();
  const navigate = useNavigate();
  const onClientError = useContext(OnClientErrorContext);
  const wasSelectedRef = useRef(false);
  /** One activate kick per sessionId until status leaves inactive (avoids effect re-entry storms). */
  const activateKickRef = useRef<string | undefined>(undefined);
  const selectSessionRef = useRef(selectSession);
  const activateSessionRef = useRef(activateSession);

  useEffect(() => {
    selectSessionRef.current = selectSession;
    activateSessionRef.current = activateSession;
  }, [activateSession, selectSession]);

  const entry = roster.find(row => row.sessionId === sessionId);
  const launchTarget = entry?.launchTarget;
  const session =
    entry === undefined
      ? undefined
      : entry.sessionId in snapshots[entry.launchTarget]
        ? snapshots[entry.launchTarget].sessions[entry.sessionId]
        : undefined;
  const status = session?.status ?? 'inactive';
  const title = entry === undefined ? 'Chat' : (entry.title ?? agentLaunchTargetLabel(entry.launchTarget));

  useEffect(() => {
    if (launchTarget === undefined) {
      activateKickRef.current = undefined;
      wasSelectedRef.current = false;
      setSelectedSessionId(undefined);
      navigate({ to: '/' }).catch(() => undefined);
      return;
    }

    if (status === 'active' || status === 'activating') {
      activateKickRef.current = sessionId;
      if (selectedSessionId !== sessionId) {
        selectSessionRef.current({ launchTarget, sessionId }).catch(onClientError);
      }
      return;
    }

    // inactive — kick activate once per sessionId
    if (activateKickRef.current === sessionId) {
      return;
    }
    activateKickRef.current = sessionId;
    activateSessionRef.current({ launchTarget, sessionId }).catch(onClientError);
  }, [launchTarget, navigate, onClientError, selectedSessionId, sessionId, setSelectedSessionId, status]);

  useEffect(() => {
    if (selectedSessionId === sessionId) {
      wasSelectedRef.current = true;
      return;
    }
    if (wasSelectedRef.current && selectedSessionId === undefined) {
      wasSelectedRef.current = false;
      navigate({ to: '/' }).catch(() => undefined);
    }
  }, [navigate, selectedSessionId, sessionId]);

  const onBack = () => {
    wasSelectedRef.current = false;
    activateKickRef.current = undefined;
    navigate({ to: '/' }).catch(() => undefined);
    setSelectedSessionId(undefined);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, gap: 0.5, px: 1, py: 0.5 }}>
        <IconButton aria-label="Back to sessions" onClick={onBack} size="small">
          <ArrowBack fontSize="small" />
        </IconButton>
        <Typography noWrap sx={{ flex: 1, fontWeight: 600 }} variant="subtitle1">
          {title}
        </Typography>
      </Stack>
      <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
        <SessionChatBody onClientError={onClientError} />
      </Box>
    </Box>
  );
};
