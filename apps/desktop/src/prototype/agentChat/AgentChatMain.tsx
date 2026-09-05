import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { FC, ReactNode, SubmitEvent } from 'react';

import { isRecord } from '../../utils.ts';

import {
  draftAtom,
  rpcWireLogSnapshotAtom,
  selectedSessionAtom,
  selectedSessionBackendAtom,
  selectedSessionIdAtom,
  selectedSessionSnapshotAtom,
  sendChatItemFn,
  setConfigOptionFn,
} from './acpBackendAtoms.ts';
import { backendLabel, normalizeSelectableConfigOptions } from './acpSessionBootstrap.ts';
import { ChatItemView } from './ChatItemView.tsx';
import { ComposerPromptEditor } from './ComposerPromptEditor.tsx';
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
  const sendChatItem = useAtomSet(sendChatItemFn, { mode: 'promise' });
  const setConfigOption = useAtomSet(setConfigOptionFn, { mode: 'promise' });

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  const chatItems = useMemo(() => selectedSession?.chatItems ?? [], [selectedSession?.chatItems]);
  const configOptions = normalizeSelectableConfigOptions(selectedSession?.sessionState);
  const controlsEnabled = selectedSession?.status === 'active' && selectedSession.pendingClientRequest !== true;
  const canSend = controlsEnabled && selectedBackend !== undefined && draft.trim().length > 0;

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
          <Alert severity="error">
            Activation failed — {selectedSession.defects.map(formatActivationDefect).join('; ')}
          </Alert>
        );
      }
      return <Alert severity="info">Session is inactive — activate it to send prompts.</Alert>;
    }
    return (
      <Alert severity="info">
        {backendLabel(selectedBackend)} is connected — send a prompt
        {selectedBackend === 'echo' ? ' or try /fixture tool-turn' : ''}.
      </Alert>
    );
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
  }, [chatItems]);

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
          {chatItems.length === 0 ? (
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
              {rpcWireLogOpen ? null : (
                <Button onClick={onOpenRpcWireLog} size="small" variant="outlined">
                  RPC wire log ({rpcSnapshot.rpcCalls.length})
                </Button>
              )}
              <Box sx={{ flexGrow: 1 }} />
              <UsagePopover usage={selectedSession?.usage} />
              <Button disabled={!canSend} type="submit" variant="contained">
                Send
              </Button>
            </Box>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
};
