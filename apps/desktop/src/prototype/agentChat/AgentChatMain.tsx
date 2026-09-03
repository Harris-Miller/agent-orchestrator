import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { FC, SubmitEvent } from 'react';

import {
  activeSnapshotAtom,
  draftAtom,
  selectedBackendAtom,
  selectedSessionAtom,
  sendChatItemFn,
  setConfigOptionFn,
} from './acpBackendAtoms.ts';
import { backendLabel, normalizeSelectableConfigOptions } from './acpSessionBootstrap.ts';
import { ChatItemView } from './ChatItemView.tsx';
import { SessionConfigOptionSelect } from './SessionConfigOptionSelect.tsx';
import { UsagePopover } from './UsageCard.tsx';

const CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 48;

export const AgentChatMain: FC<{
  readonly onClientError: (error: unknown) => void;
  readonly onOpenRpcWireLog: () => void;
  readonly rpcWireLogOpen: boolean;
}> = ({ onClientError, onOpenRpcWireLog, rpcWireLogOpen }) => {
  const [selectedBackend] = useAtom(selectedBackendAtom);
  const [draft, setDraft] = useAtom(draftAtom(selectedBackend));
  const snapshot = useAtomValue(activeSnapshotAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const sendChatItem = useAtomSet(sendChatItemFn, { mode: 'promise' });
  const setConfigOption = useAtomSet(setConfigOptionFn, { mode: 'promise' });

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  const chatItems = useMemo(() => selectedSession?.chatItems ?? [], [selectedSession?.chatItems]);
  const configOptions = normalizeSelectableConfigOptions(selectedSession?.sessionState);
  const controlsEnabled = selectedSession?.status === 'active' && selectedSession.pendingClientRequest !== true;
  const canSend = controlsEnabled && draft.trim().length > 0;

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    const text = draft;
    setDraft('');
    sendChatItem({ backend: selectedBackend, text }).catch(onClientError);
  };

  const emptyStateSecondary = (() => {
    if (snapshot.phase !== 'ready') {
      return `Starting ${backendLabel(selectedBackend)} over ACP…`;
    }
    if (selectedSession === undefined) {
      return 'No session selected — create or select a session from the left panel.';
    }
    if (selectedSession.status === 'activating') {
      return 'Activating session…';
    }
    if (selectedSession.status === 'inactive') {
      return 'Session is inactive — activate it to send prompts.';
    }
    return `${backendLabel(selectedBackend)} is connected — send a prompt${selectedBackend === 'echo' ? ' or try /fixture tool-turn' : ''}.`;
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
              <ListItemText primary="No messages yet" secondary={emptyStateSecondary} />
            </ListItem>
          ) : (
            chatItems.map(item => <ChatItemView item={item} key={item.id} />)
          )}
        </List>
      </Paper>

      <Paper sx={{ flexShrink: 0, p: 2 }}>
        <Stack spacing={1}>
          <Typography color="text.secondary" variant="caption">
            PROTOTYPE · agent: {backendLabel(selectedBackend)} · session: {selectedSession?.sessionId ?? '—'}
          </Typography>
          {snapshot.error !== undefined ? (
            <Typography color="error" variant="body2">
              {snapshot.error}
            </Typography>
          ) : null}
          <Box component="form" onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              disabled={!controlsEnabled}
              fullWidth
              onChange={event => {
                setDraft(event.target.value);
              }}
              placeholder={`Message ${backendLabel(selectedBackend)}…`}
              size="small"
              value={draft}
            />
            <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {configOptions.map(option => (
                <SessionConfigOptionSelect
                  disabled={!controlsEnabled}
                  key={option.id}
                  onChange={(configId, value) => {
                    setConfigOption({ backend: selectedBackend, configId, value }).catch(onClientError);
                  }}
                  option={option}
                />
              ))}
              {rpcWireLogOpen ? null : (
                <Button onClick={onOpenRpcWireLog} size="small" variant="outlined">
                  RPC wire log ({snapshot.rpcCalls.length})
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
