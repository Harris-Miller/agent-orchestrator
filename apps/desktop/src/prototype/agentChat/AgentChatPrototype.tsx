/**
 * PROTOTYPE — simple MUI agent chat surface for the ACP harness.
 */
import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FC, SubmitEvent } from 'react';

import {
  activeSnapshotAtom,
  allBackendPhasesAtom,
  draftAtom,
  restartBackendFn,
  selectedBackendAtom,
  selectedSessionAtom,
  sendChatItemFn,
  setModeFn,
  setModelFn,
} from './acpBackendAtoms.ts';
import { backendLabel, isRecord, normalizeModels, normalizeModes } from './acpSessionBootstrap.ts';
import type { AcpAgentBackend, RpcWireEntry } from './agentHarness.ts';
import { BootstrapStatePanel, SESSION_STATE_DRAWER_WIDTH } from './BootstrapStatePanel.tsx';
import { ChatItemView } from './ChatItemView.tsx';
import { SESSION_ROSTER_DRAWER_WIDTH, SessionRosterDrawer } from './SessionRosterDrawer.tsx';

const RPC_WIRE_LOG_DRAWER_HEIGHT = 320;
const CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 48;

const backendOptions: readonly { readonly label: string; readonly value: AcpAgentBackend }[] = [
  { label: 'Echo (jsonrpc-echo)', value: 'echo' },
  { label: 'Codex', value: 'codex-acp' },
  { label: 'Claude', value: 'claude-agent-acp' },
];

const entryIdNameMap = new Map<number, string>();

const rpcWireEntryTitle = (entry: RpcWireEntry): string => {
  const arrow = entry.direction === 'out' ? '→' : '←';
  if (isRecord(entry.message)) {
    if (entry.direction === 'in') {
      if (entry.message.requestId != null) {
        const cachedName = entryIdNameMap.get(entry.message.requestId as number);
        return `${arrow} ${cachedName ?? 'message'}`;
      }
      if (typeof entry.message.tag === 'string') {
        return `${arrow} ${entry.message.tag}`;
      }
      return `${arrow} message`;
    }

    const cachedName = (() => {
      if (typeof entry.message.tag === 'string') {
        return entry.message.tag;
      }
      if (typeof entry.message.method === 'string') {
        return entry.message.method;
      }
      if ('error' in entry.message) {
        return 'error';
      }
      if ('result' in entry.message) {
        return 'response';
      }
      return 'message';
    })();

    if (entry.message.id != null) {
      entryIdNameMap.set(entry.message.id as number, cachedName);
    }

    return `${arrow} ${cachedName}`;
  }

  return `${arrow} message`;
};

const phaseColor = (phase: string): 'default' | 'error' | 'success' | 'warning' => {
  switch (phase) {
    case 'connecting':
    case 'initialized':
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
  const [sessionRosterOpen, setSessionRosterOpen] = useState(true);
  const [sessionStateOpen, setSessionStateOpen] = useState(true);
  const [rpcWireLogOpen, setRpcWireLogOpen] = useState(false);
  const [selectedBackend, setSelectedBackend] = useAtom(selectedBackendAtom);
  const [draft, setDraft] = useAtom(draftAtom(selectedBackend));
  const snapshot = useAtomValue(activeSnapshotAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const backendPhases = useAtomValue(allBackendPhasesAtom);
  const sendChatItem = useAtomSet(sendChatItemFn, { mode: 'promise' });
  const restartBackend = useAtomSet(restartBackendFn, { mode: 'promise' });
  const setMode = useAtomSet(setModeFn, { mode: 'promise' });
  const setModel = useAtomSet(setModelFn, { mode: 'promise' });

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  const chatItems = useMemo(() => selectedSession?.chatItems ?? [], [selectedSession?.chatItems]);
  const models = normalizeModels(selectedSession?.sessionState);
  const modes = normalizeModes(selectedSession?.sessionState);
  const promptEnabled = selectedSession?.status === 'active';
  const canSend = promptEnabled && draft.trim().length > 0;
  const controlsEnabled = promptEnabled;

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    const text = draft;
    setDraft('');
    sendChatItem({ backend: selectedBackend, text }).catch(() => undefined);
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
      sx={{
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <AppBar
        position="sticky"
        sx={theme => ({
          flexShrink: 0,
          top: 0,
          transition: theme.transitions.create(['margin', 'width'], {
            duration: theme.transitions.duration.leavingScreen,
            easing: theme.transitions.easing.sharp,
          }),
          zIndex: theme.zIndex.appBar,
          ...((sessionRosterOpen || sessionStateOpen) && {
            marginLeft: sessionRosterOpen ? `${SESSION_ROSTER_DRAWER_WIDTH}px` : 0,
            marginRight: sessionStateOpen ? `${SESSION_STATE_DRAWER_WIDTH}px` : 0,
            transition: theme.transitions.create(['margin', 'width'], {
              duration: theme.transitions.duration.enteringScreen,
              easing: theme.transitions.easing.easeOut,
            }),
            width: `calc(100% - ${sessionRosterOpen ? SESSION_ROSTER_DRAWER_WIDTH : 0}px - ${sessionStateOpen ? SESSION_STATE_DRAWER_WIDTH : 0}px)`,
          }),
        })}
      >
        <Toolbar sx={{ gap: 1 }}>
          {sessionRosterOpen ? null : (
            <Button
              onClick={() => {
                setSessionRosterOpen(true);
              }}
              size="small"
              variant="outlined"
            >
              Sessions
            </Button>
          )}
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
          {sessionStateOpen ? null : (
            <Button
              onClick={() => {
                setSessionStateOpen(true);
              }}
              size="small"
              variant="outlined"
            >
              Session state
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <SessionRosterDrawer
          backend={selectedBackend}
          onClose={() => {
            setSessionRosterOpen(false);
          }}
          open={sessionRosterOpen}
        />

        <Box
          component="main"
          sx={theme => ({
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            gap: 2,
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
            p: 2,
            position: 'relative',
            transition: theme.transitions.create(['margin-bottom', 'margin-left', 'margin-right'], {
              duration: theme.transitions.duration.leavingScreen,
              easing: theme.transitions.easing.sharp,
            }),
            ...((sessionRosterOpen || sessionStateOpen || rpcWireLogOpen) && {
              transition: theme.transitions.create(['margin-bottom', 'margin-left', 'margin-right'], {
                duration: theme.transitions.duration.enteringScreen,
                easing: theme.transitions.easing.easeOut,
              }),
            }),
          })}
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
                <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                  <FormControl disabled={!controlsEnabled} size="small" sx={{ minWidth: 180 }}>
                    <InputLabel id="acp-model-label">Model</InputLabel>
                    <Select
                      label="Model"
                      labelId="acp-model-label"
                      onChange={event => {
                        setModel({ backend: selectedBackend, modelId: event.target.value }).catch(() => undefined);
                      }}
                      value={selectedSession?.selectedModelId ?? models.currentId ?? ''}
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
                      value={selectedSession?.selectedModeId ?? modes.currentId ?? ''}
                    >
                      {modes.options.map(option => (
                        <MenuItem key={option.id} value={option.id}>
                          {option.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {rpcWireLogOpen ? null : (
                    <Button
                      onClick={() => {
                        setRpcWireLogOpen(true);
                      }}
                      size="small"
                      variant="outlined"
                    >
                      RPC wire log ({snapshot.rpcCalls.length})
                    </Button>
                  )}
                  <Box sx={{ flexGrow: 1 }} />
                  <Button disabled={!canSend} type="submit" variant="contained">
                    Send
                  </Button>
                </Box>
              </Box>
            </Stack>
          </Paper>
        </Box>

        <BootstrapStatePanel
          initializeResult={snapshot.initializeResult}
          onClose={() => {
            setSessionStateOpen(false);
          }}
          open={sessionStateOpen}
          session={selectedSession}
        />
      </Box>

      <Drawer
        anchor="bottom"
        open={rpcWireLogOpen}
        sx={{
          '& .MuiDrawer-paper': {
            borderColor: 'divider',
            borderTop: 1,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            height: RPC_WIRE_LOG_DRAWER_HEIGHT,
          },
          flexShrink: 0,
          height: rpcWireLogOpen ? RPC_WIRE_LOG_DRAWER_HEIGHT : 0,
        }}
        variant="persistent"
      >
        <Box
          sx={{
            alignItems: 'center',
            display: 'flex',
            flexShrink: 0,
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
          }}
        >
          <Typography variant="h6">RPC wire log ({snapshot.rpcCalls.length})</Typography>
          <IconButton
            aria-label="Close RPC wire log drawer"
            edge="end"
            onClick={() => {
              setRpcWireLogOpen(false);
            }}
            size="small"
          >
            <Typography component="span" sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
              ∨
            </Typography>
          </IconButton>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
          {snapshot.rpcCalls.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              No RPC traffic yet.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {snapshot.rpcCalls.map(entry => (
                <Accordion
                  disableGutters
                  elevation={0}
                  key={entry.id}
                  sx={{
                    '&::before': { display: 'none' },
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                  }}
                >
                  <AccordionSummary sx={{ '& .MuiAccordionSummary-content': { my: 0.5 }, minHeight: 36 }}>
                    <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }} variant="body2">
                      {rpcWireEntryTitle(entry)}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <Box
                      component="pre"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        m: 0,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {JSON.stringify({ direction: entry.direction, message: entry.message }, null, 2)}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          )}
        </Box>
      </Drawer>
    </Box>
  );
};
