/**
 * PROTOTYPE — simple MUI agent chat surface for the ACP harness.
 */
import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import type { FC, SubmitEvent } from 'react';

import {
  activeSnapshotAtom,
  allBackendPhasesAtom,
  draftAtom,
  restartBackendFn,
  selectedBackendAtom,
  sendChatItemFn,
  setModeFn,
  setModelFn,
} from './acpBackendAtoms.ts';
import { backendLabel, normalizeModels, normalizeModes } from './acpSessionBootstrap.ts';
import type { AcpAgentBackend } from './agentHarness.ts';
import { ChatItemView } from './ChatItemView.tsx';

const backendOptions: readonly { readonly label: string; readonly value: AcpAgentBackend }[] = [
  { label: 'Echo (jsonrpc-echo)', value: 'echo' },
  { label: 'Codex', value: 'codex-acp' },
  { label: 'Claude', value: 'claude-agent-acp' },
];

const phaseColor = (phase: string): 'default' | 'error' | 'success' | 'warning' => {
  switch (phase) {
    case 'connecting':
    case 'initialized':
    case 'session_open':
      return 'warning';
    case 'error':
      return 'error';
    case 'ready':
      return 'success';
    default:
      return 'default';
  }
};

export const AgentChatPrototype: FC = () => {
  const [selectedBackend, setSelectedBackend] = useAtom(selectedBackendAtom);
  const [draft, setDraft] = useAtom(draftAtom(selectedBackend));
  const snapshot = useAtomValue(activeSnapshotAtom);
  const backendPhases = useAtomValue(allBackendPhasesAtom);
  const sendChatItem = useAtomSet(sendChatItemFn, { mode: 'promise' });
  const restartBackend = useAtomSet(restartBackendFn, { mode: 'promise' });
  const setMode = useAtomSet(setModeFn, { mode: 'promise' });
  const setModel = useAtomSet(setModelFn, { mode: 'promise' });

  const models = normalizeModels(snapshot.sessionNewResult);
  const modes = normalizeModes(snapshot.sessionNewResult);
  const canSend = snapshot.phase === 'ready' && draft.trim().length > 0;
  const controlsEnabled = snapshot.phase === 'ready';

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    const text = draft;
    setDraft('');
    sendChatItem({ backend: selectedBackend, text }).catch(() => undefined);
  };

  const emptyStateSecondary =
    snapshot.phase === 'ready'
      ? `${backendLabel(selectedBackend)} is connected — send a prompt${selectedBackend === 'echo' ? ' or try /fixture tool-turn' : ''}.`
      : `Starting ${backendLabel(selectedBackend)} over ACP…`;

  return (
    <Box sx={{ bgcolor: 'background.default', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <Typography sx={{ flexGrow: 1 }} variant="h3">
            Agent Chat
          </Typography>
          <Stack direction="row" spacing={1}>
            {backendPhases.map(entry => (
              <Chip
                color={phaseColor(entry.phase)}
                key={entry.backend}
                label={`${entry.label}: ${entry.phase}`}
                onClick={
                  entry.phase === 'error'
                    ? () => {
                        restartBackend(entry.backend).catch(() => undefined);
                      }
                    : undefined
                }
                size="small"
                sx={{ cursor: entry.phase === 'error' ? 'pointer' : 'default' }}
                variant="outlined"
              />
            ))}
          </Stack>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="acp-agent-backend-label">Agent</InputLabel>
            <Select
              label="Agent"
              labelId="acp-agent-backend-label"
              onChange={event => {
                setSelectedBackend(event.target.value);
              }}
              value={selectedBackend}
            >
              {backendOptions.map(option => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
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
                <ListItemText primary="No messages yet" secondary={emptyStateSecondary} />
              </ListItem>
            ) : (
              snapshot.chatItems.map(item => <ChatItemView item={item} key={item.id} />)
            )}
          </List>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Stack spacing={1}>
            <Typography color="text.secondary" variant="caption">
              PROTOTYPE · agent: {backendLabel(selectedBackend)} · session: {snapshot.sessionId ?? '—'}
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
              <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                <FormControl disabled={!controlsEnabled} size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="acp-model-label">Model</InputLabel>
                  <Select
                    label="Model"
                    labelId="acp-model-label"
                    onChange={event => {
                      setModel({ backend: selectedBackend, modelId: event.target.value }).catch(() => undefined);
                    }}
                    value={snapshot.selectedModelId ?? models.currentId ?? ''}
                  >
                    {models.options.map(option => (
                      <MenuItem key={option.id} value={option.id}>
                        {option.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl disabled={!controlsEnabled} size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="acp-mode-label">Mode</InputLabel>
                  <Select
                    label="Mode"
                    labelId="acp-mode-label"
                    onChange={event => {
                      setMode({ backend: selectedBackend, modeId: event.target.value }).catch(() => undefined);
                    }}
                    value={snapshot.selectedModeId ?? modes.currentId ?? ''}
                  >
                    {modes.options.map(option => (
                      <MenuItem key={option.id} value={option.id}>
                        {option.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box sx={{ flexGrow: 1 }} />
                <Button disabled={!canSend} type="submit" variant="contained">
                  Send
                </Button>
              </Box>
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
