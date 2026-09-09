import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode, SubmitEvent } from 'react';

import { isRecord } from '../../utils.ts';

import {
  activateSessionFn,
  allBackendPhasesAtom,
  draftAtom,
  handoffInProgressAtom,
  handoffSessionFn,
  providerConfigAtom,
  respondElicitationFn,
  respondPermissionFn,
  rpcWireLogSnapshotAtom,
  saveHarnessDefaultsFn,
  selectedSessionAtom,
  selectedSessionBackendAtom,
  selectedSessionIdAtom,
  selectedSessionSnapshotAtom,
  sendChatItemFn,
  setConfigOptionFn,
  unifiedSessionRosterAtom,
} from './acpBackendAtoms.ts';
import { ALL_ACP_BACKENDS, backendLabel, normalizeSelectableConfigOptions } from './acpSessionBootstrap.ts';
import type { AcpAgentBackend } from './agentHarness.ts';
import { ChatItemView } from './ChatItemView.tsx';
import { ComposerPromptEditor } from './ComposerPromptEditor.tsx';
import { ElicitationFormCard } from './ElicitationFormCard.tsx';
import { HandoffModal } from './HandoffModal.tsx';
import { PermissionRequestCard } from './PermissionRequestCard.tsx';
import type { ProviderConfigStored } from './providerConfigStorage.ts';
import { SessionConfigOptionSelect } from './SessionConfigOptionSelect.tsx';
import { UsagePopover } from './UsageCard.tsx';

const CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 48;

const formatActivationDefect = (defect: unknown): string => {
  if (!isRecord(defect)) {
    return String(defect);
  }
  const message = typeof defect.message === 'string' ? defect.message : undefined;
  const details = isRecord(defect.data) && typeof defect.data.details === 'string' ? defect.data.details : undefined;
  if (message !== undefined && details !== undefined) {
    return `${message}: ${details}`;
  }
  if (message !== undefined) {
    return message;
  }
  return JSON.stringify(defect);
};

export const AgentChatMain: FC<{
  readonly onClientError: (error: unknown) => void;
  readonly onOpenRpcWireLog: () => void;
  readonly rpcWireLogOpen: boolean;
}> = ({ onClientError, onOpenRpcWireLog, rpcWireLogOpen }) => {
  const selectedBackend = useAtomValue(selectedSessionBackendAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const draftSessionId = selectedSessionId ?? '';
  const [draft, setDraft] = useAtom(draftAtom(draftSessionId));
  const backendSnapshot = useAtomValue(selectedSessionSnapshotAtom);
  const rpcSnapshot = useAtomValue(rpcWireLogSnapshotAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const handoffInProgress = useAtomValue(handoffInProgressAtom);
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const backendPhases = useAtomValue(allBackendPhasesAtom);
  const sendChatItem = useAtomSet(sendChatItemFn, { mode: 'promise' });
  const activateSession = useAtomSet(activateSessionFn, { mode: 'promise' });
  const handoffSession = useAtomSet(handoffSessionFn, { mode: 'promise' });
  const setConfigOption = useAtomSet(setConfigOptionFn, { mode: 'promise' });
  const saveHarnessDefaults = useAtomSet(saveHarnessDefaultsFn, { mode: 'promise' });
  const respondElicitation = useAtomSet(respondElicitationFn, { mode: 'promise' });
  const respondPermission = useAtomSet(respondPermissionFn, { mode: 'promise' });
  const claudeProviderConfig = useAtomValue(providerConfigAtom('claude-agent-acp'));
  const codexProviderConfig = useAtomValue(providerConfigAtom('codex-acp'));
  const geminiProviderConfig = useAtomValue(providerConfigAtom('gemini-cli'));

  const getProviderConfig = (backend: AcpAgentBackend): ProviderConfigStored | undefined => {
    switch (backend) {
      case 'claude-agent-acp':
        return claudeProviderConfig;
      case 'codex-acp':
        return codexProviderConfig;
      case 'gemini-cli':
        return geminiProviderConfig;
    }
  };

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const [splitMenuAnchor, setSplitMenuAnchor] = useState<HTMLElement | null>(null);
  const [handoffModalOpen, setHandoffModalOpen] = useState(false);

  const chatItems = useMemo(() => selectedSession?.chatItems ?? [], [selectedSession?.chatItems]);
  const configOptions = normalizeSelectableConfigOptions(selectedSession?.sessionState);
  const hasPendingInteraction =
    selectedSession?.pendingElicitation !== undefined || selectedSession?.pendingPermission !== undefined;
  const pendingClientRequest = selectedSession?.pendingClientRequest === true;
  const controlsEnabled =
    selectedSession?.status === 'active' && !pendingClientRequest && !hasPendingInteraction && !handoffInProgress;
  const canSend = controlsEnabled && selectedBackend !== undefined && draft.trim().length > 0;
  const hasTranscriptMessage = chatItems.some(item => item.kind === 'user_message' || item.kind === 'agent_message');
  const sourceCwd =
    selectedBackend === undefined || selectedSessionId === undefined
      ? undefined
      : roster.find(entry => entry.backend === selectedBackend && entry.sessionId === selectedSessionId)?.cwd;
  const canHandoff =
    controlsEnabled &&
    selectedBackend !== undefined &&
    selectedSessionId !== undefined &&
    hasTranscriptMessage &&
    sourceCwd !== undefined;
  const canSaveDefaults = controlsEnabled && configOptions.length > 0;
  const agentTitle = selectedBackend === undefined ? 'Agent' : backendLabel(selectedBackend);
  const readyBackends = ALL_ACP_BACKENDS.filter(backend =>
    backendPhases.some(entry => entry.backend === backend && entry.phase === 'ready'),
  );

  const sendDraft = () => {
    if (selectedBackend === undefined || !controlsEnabled || draft.trim().length === 0) {
      return;
    }

    const text = draft;
    setDraft('');
    sendChatItem({ backend: selectedBackend, text }).catch(onClientError);
  };

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendDraft();
  };

  const emptyStateSecondary: ReactNode = (() => {
    if (selectedBackend === undefined) {
      return <Alert severity="info">No session selected — create or select a session from the left panel.</Alert>;
    }
    if (backendSnapshot?.phase !== 'ready') {
      return <Alert severity="info">Starting {backendLabel(selectedBackend)} over ACP…</Alert>;
    }
    if (selectedSession === undefined) {
      return <Alert severity="info">No session selected — create or select a session from the left panel.</Alert>;
    }
    if (selectedSession.status === 'activating') {
      return <Alert severity="info">Activating session…</Alert>;
    }
    if (selectedSession.status === 'inactive') {
      if (selectedSession.defects !== undefined && selectedSession.defects.length > 0) {
        return (
          <Alert
            action={
              <Button
                color="inherit"
                onClick={() => {
                  activateSession({ backend: selectedBackend, sessionId: selectedSession.sessionId }).catch(
                    () => undefined,
                  );
                }}
                size="small"
              >
                Retry
              </Button>
            }
            severity="error"
          >
            Activation failed — {selectedSession.defects.map(formatActivationDefect).join('; ')}
          </Alert>
        );
      }
      return <Alert severity="info">Session is inactive — select it again to activate.</Alert>;
    }
    return <Alert severity="info">{backendLabel(selectedBackend)} is connected — send a prompt</Alert>;
  })();

  useEffect(() => {
    pinnedToBottomRef.current = true;
  }, [selectedBackend, selectedSession?.sessionId]);

  useLayoutEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (chatScroll === null || !pinnedToBottomRef.current) {
      return;
    }

    chatScroll.scrollTop = chatScroll.scrollHeight;
  }, [chatItems, selectedSession?.pendingElicitation, selectedSession?.pendingPermission]);

  return (
    <Box
      component="main"
      sx={{
        bgcolor: 'background.default',
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        gap: 2,
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        p: 2,
      }}
    >
      <Paper
        onScroll={event => {
          const target = event.currentTarget;
          pinnedToBottomRef.current =
            target.scrollHeight - target.scrollTop - target.clientHeight <= CHAT_SCROLL_BOTTOM_THRESHOLD_PX;
        }}
        ref={chatScrollRef}
        sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1 }}
      >
        <List dense disablePadding>
          {chatItems.length === 0 && !hasPendingInteraction ? (
            <ListItem>
              <ListItemText
                primary="No messages yet"
                secondary={emptyStateSecondary}
                slotProps={{ secondary: { component: 'div' } }}
              />
            </ListItem>
          ) : (
            chatItems.map(item => <ChatItemView item={item} key={item.id} />)
          )}
          {selectedSession?.pendingElicitation !== undefined && selectedBackend !== undefined ? (
            <ListItem alignItems="flex-start" sx={{ display: 'block', px: 1, py: 1 }}>
              <ElicitationFormCard
                agentTitle={agentTitle}
                onAccept={content => {
                  respondElicitation({
                    backend: selectedBackend,
                    response: { action: 'accept', content },
                    sessionId: selectedSession.sessionId,
                  }).catch(onClientError);
                }}
                onCancel={() => {
                  respondElicitation({
                    backend: selectedBackend,
                    response: { action: 'cancel' },
                    sessionId: selectedSession.sessionId,
                  }).catch(onClientError);
                }}
                onDecline={() => {
                  respondElicitation({
                    backend: selectedBackend,
                    response: { action: 'decline' },
                    sessionId: selectedSession.sessionId,
                  }).catch(onClientError);
                }}
                request={selectedSession.pendingElicitation.request}
              />
            </ListItem>
          ) : null}
          {selectedSession?.pendingPermission !== undefined && selectedBackend !== undefined ? (
            <ListItem alignItems="flex-start" sx={{ display: 'block', px: 1, py: 1 }}>
              <PermissionRequestCard
                agentTitle={agentTitle}
                onSelect={optionId => {
                  respondPermission({
                    backend: selectedBackend,
                    optionId,
                    sessionId: selectedSession.sessionId,
                  }).catch(onClientError);
                }}
                request={selectedSession.pendingPermission.request}
              />
            </ListItem>
          ) : null}
        </List>
      </Paper>

      <Paper sx={{ flexShrink: 0, p: 2 }}>
        <Stack spacing={1}>
          <Typography color="text.secondary" variant="caption">
            PROTOTYPE · agent: {selectedBackend === undefined ? '—' : backendLabel(selectedBackend)} · session:{' '}
            {selectedSession?.sessionId ?? '—'}
          </Typography>
          {backendSnapshot?.error !== undefined ? (
            <Typography color="error" variant="body2">
              {backendSnapshot.error}
            </Typography>
          ) : null}
          <Box component="form" onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <ComposerPromptEditor
              disabled={!controlsEnabled}
              key={selectedSessionId ?? 'none'}
              onChange={setDraft}
              onSubmit={sendDraft}
              placeholder={
                selectedBackend === undefined ? 'Select a session…' : `Message ${backendLabel(selectedBackend)}…`
              }
              value={draft}
            />
            <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {configOptions.map(option => (
                <SessionConfigOptionSelect
                  disabled={!controlsEnabled || selectedBackend === undefined}
                  key={option.id}
                  onChange={(configId, value) => {
                    if (selectedBackend === undefined) {
                      return;
                    }
                    setConfigOption({ backend: selectedBackend, configId, value }).catch(onClientError);
                  }}
                  option={option}
                />
              ))}
              {selectedBackend !== undefined && canSaveDefaults ? (
                <Button
                  onClick={() => {
                    saveHarnessDefaults({ backend: selectedBackend }).catch(onClientError);
                  }}
                  size="small"
                  variant="outlined"
                >
                  Save as defaults for {backendLabel(selectedBackend)}
                </Button>
              ) : null}
              {rpcWireLogOpen ? null : (
                <Button onClick={onOpenRpcWireLog} size="small" variant="outlined">
                  RPC wire log ({rpcSnapshot.rpcCalls.length})
                </Button>
              )}
              <Box sx={{ flexGrow: 1 }} />
              <UsagePopover usage={selectedSession?.usage} />
              <ButtonGroup variant="contained">
                <Button
                  aria-label={pendingClientRequest ? 'Pending client request' : 'Send'}
                  disabled={!canSend}
                  sx={{ minWidth: 40, px: 1.5 }}
                  type="submit"
                >
                  {pendingClientRequest ? (
                    <CircularProgress color="inherit" size={18} />
                  ) : (
                    <ArrowUpward fontSize="small" />
                  )}
                </Button>
                <Button
                  aria-controls={splitMenuAnchor !== null ? 'send-split-menu' : undefined}
                  aria-expanded={splitMenuAnchor !== null ? 'true' : undefined}
                  aria-haspopup="menu"
                  aria-label="Open send options"
                  disabled={handoffInProgress || selectedBackend === undefined}
                  onClick={event => {
                    setSplitMenuAnchor(event.currentTarget);
                  }}
                  size="small"
                >
                  <KeyboardArrowDown />
                </Button>
              </ButtonGroup>
              <Menu
                anchorEl={splitMenuAnchor}
                id="send-split-menu"
                onClose={() => {
                  setSplitMenuAnchor(null);
                }}
                open={splitMenuAnchor !== null}
              >
                <MenuItem
                  disabled={!canHandoff}
                  onClick={() => {
                    setSplitMenuAnchor(null);
                    setHandoffModalOpen(true);
                  }}
                >
                  Handoff
                </MenuItem>
              </Menu>
            </Box>
          </Box>
        </Stack>
      </Paper>

      {selectedBackend !== undefined && handoffModalOpen ? (
        <HandoffModal
          getProviderConfig={getProviderConfig}
          key={`${selectedBackend}:${selectedSessionId ?? ''}`}
          onCancel={() => {
            setHandoffModalOpen(false);
          }}
          onConfirm={({ configValues, targetBackend }) => {
            if (selectedSessionId === undefined) {
              return;
            }
            setHandoffModalOpen(false);
            handoffSession({
              configValues,
              sourceBackend: selectedBackend,
              sourceSessionId: selectedSessionId,
              targetBackend,
            }).catch(onClientError);
          }}
          open
          readyBackends={readyBackends}
          sourceBackend={selectedBackend}
        />
      ) : null}
    </Box>
  );
};
