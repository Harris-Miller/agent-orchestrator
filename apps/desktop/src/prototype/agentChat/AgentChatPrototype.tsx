/**
 * PROTOTYPE — simple MUI agent chat surface for the jsonrpc-echo harness.
 */
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC, SubmitEvent } from 'react';

import { ChatItemView } from './ChatItemView.tsx';
import { EchoAgentProvider } from './EchoAgentProvider.tsx';
import { useEchoAgent } from './useEchoAgent.ts';

const statusColor = (status: string): 'default' | 'error' | 'success' | 'warning' => {
  switch (status) {
    case 'connecting':
      return 'warning';
    case 'error':
      return 'error';
    case 'ready':
      return 'success';
    default:
      return 'default';
  }
};

const AgentChatContent: FC = () => {
  const { sendMessage, snapshot } = useEchoAgent();
  const [draft, setDraft] = useState('');
  const canSend = snapshot.status === 'ready' && draft.trim().length > 0;

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    const text = draft;
    setDraft('');
    sendMessage(text).catch(() => undefined);
  };

  return (
    <Box sx={{ bgcolor: 'background.default', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography sx={{ flexGrow: 1 }} variant="h3">
            Agent Chat
          </Typography>
          <Chip color={statusColor(snapshot.status)} label={snapshot.status} size="small" variant="outlined" />
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          gap: 2,
          maxWidth: 900,
          mx: 'auto',
          p: 2,
          width: '100%',
        }}
      >
        <Paper sx={{ flex: 1, minHeight: 360, overflow: 'auto', p: 1 }}>
          <List dense disablePadding>
            {snapshot.chatItems.length === 0 ? (
              <ListItem>
                <ListItemText
                  primary="No messages yet"
                  secondary={
                    snapshot.status === 'ready'
                      ? 'jsonrpc-echo is connected — send a prompt or try /fixture tool-turn.'
                      : 'Starting jsonrpc-echo over ACP…'
                  }
                />
              </ListItem>
            ) : (
              snapshot.chatItems.map(item => <ChatItemView item={item} key={item.id} />)
            )}
          </List>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography color="text.secondary" variant="caption">
              PROTOTYPE · agent: jsonrpc-echo · session: {snapshot.sessionId ?? '—'}
            </Typography>
            {snapshot.error !== undefined ? (
              <Typography color="error" variant="body2">
                {snapshot.error}
              </Typography>
            ) : null}
            <Box component="form" onSubmit={onSubmit} sx={{ display: 'flex', gap: 1 }}>
              <TextField
                disabled={snapshot.status !== 'ready'}
                fullWidth
                onChange={event => {
                  setDraft(event.target.value);
                }}
                placeholder="Message the echo agent…"
                size="small"
                value={draft}
              />
              <Button disabled={!canSend} type="submit" variant="contained">
                Send
              </Button>
            </Box>
          </Stack>
        </Paper>

        <Paper sx={{ maxHeight: 320, overflow: 'auto', p: 2 }}>
          <Stack spacing={1}>
            <Typography color="text.secondary" variant="caption">
              RPC wire log ({snapshot.rpcCalls.length})
            </Typography>
            {snapshot.rpcCalls.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                No RPC traffic yet.
              </Typography>
            ) : (
              snapshot.rpcCalls.map(entry => (
                <Box
                  component="pre"
                  key={entry.id}
                  sx={{
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    m: 0,
                    overflow: 'auto',
                    p: 1,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {JSON.stringify({ direction: entry.direction, message: entry.message }, null, 2)}
                </Box>
              ))
            )}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
};

export const AgentChatPrototype: FC = () => (
  <EchoAgentProvider>
    <AgentChatContent />
  </EchoAgentProvider>
);
