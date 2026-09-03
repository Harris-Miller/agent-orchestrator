import 'allotment/dist/style.css';

import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { useState } from 'react';
import type { FC } from 'react';

import {
  activeSnapshotAtom,
  allBackendPhasesAtom,
  restartBackendFn,
  selectedBackendAtom,
  selectedSessionAtom,
} from './acpBackendAtoms.ts';
import { AgentChatMain } from './AgentChatMain.tsx';
import type { AcpAgentBackend } from './agentHarness.ts';
import { BootstrapStatePanel, SESSION_STATE_PANEL_WIDTH } from './BootstrapStatePanel.tsx';
import { RPC_WIRE_LOG_PANEL_HEIGHT, RpcWireLogPanel } from './RpcWireLogPanel.tsx';
import { SESSION_ROSTER_PANEL_WIDTH, SessionRosterPanel } from './SessionRosterPanel.tsx';

const backendOptions: readonly {
  readonly disabled?: boolean;
  readonly label: string;
  readonly value: AcpAgentBackend;
}[] = [
  { label: 'Echo (jsonrpc-echo)', value: 'echo' },
  { label: 'Codex', value: 'codex-acp' },
  { label: 'Claude', value: 'claude-agent-acp' },
  { disabled: true, label: 'Gemini', value: 'gemini-cli' },
];

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

export const AgentChatWorkbench: FC<{
  readonly onClientError: (error: unknown) => void;
}> = ({ onClientError }) => {
  const [sessionRosterOpen, setSessionRosterOpen] = useState(true);
  const [sessionStateOpen, setSessionStateOpen] = useState(true);
  const [rpcWireLogOpen, setRpcWireLogOpen] = useState(false);
  const [selectedBackend, setSelectedBackend] = useAtom(selectedBackendAtom);
  const snapshot = useAtomValue(activeSnapshotAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const backendPhases = useAtomValue(allBackendPhasesAtom);
  const restartBackend = useAtomSet(restartBackendFn, { mode: 'promise' });

  return (
    <Box
      sx={{
        // Soften Allotment sash against MUI divider/action colors
        '& .sash': {
          backgroundColor: 'transparent',
        },
        '& .sash-active': {
          backgroundColor: 'action.selected',
        },
        '& .sash-hover': {
          backgroundColor: 'action.hover',
        },
        '& .split-view-separator-border > .split-view-container > .split-view-view:not(:first-of-type)::before': {
          backgroundColor: 'divider',
        },
        bgcolor: 'background.default',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Allotment
        onVisibleChange={(index, visible) => {
          if (index === 1) {
            setRpcWireLogOpen(visible);
          }
        }}
        vertical
      >
        <Allotment.Pane>
          <Allotment
            onVisibleChange={(index, visible) => {
              if (index === 0) {
                setSessionRosterOpen(visible);
              } else if (index === 2) {
                setSessionStateOpen(visible);
              }
            }}
          >
            <Allotment.Pane minSize={200} preferredSize={SESSION_ROSTER_PANEL_WIDTH} snap visible={sessionRosterOpen}>
              <SessionRosterPanel
                backend={selectedBackend}
                onClose={() => {
                  setSessionRosterOpen(false);
                }}
              />
            </Allotment.Pane>

            <Allotment.Pane minSize={280}>
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
                <AppBar position="static" sx={{ flexShrink: 0 }}>
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
                          <MenuItem disabled={option.disabled} key={option.value} value={option.value}>
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

                <AgentChatMain
                  onClientError={onClientError}
                  onOpenRpcWireLog={() => {
                    setRpcWireLogOpen(true);
                  }}
                  rpcWireLogOpen={rpcWireLogOpen}
                />
              </Box>
            </Allotment.Pane>

            <Allotment.Pane minSize={240} preferredSize={SESSION_STATE_PANEL_WIDTH} snap visible={sessionStateOpen}>
              <BootstrapStatePanel
                initializeResult={snapshot.initializeResult}
                onClose={() => {
                  setSessionStateOpen(false);
                }}
                session={selectedSession}
              />
            </Allotment.Pane>
          </Allotment>
        </Allotment.Pane>

        <Allotment.Pane minSize={120} preferredSize={RPC_WIRE_LOG_PANEL_HEIGHT} snap visible={rpcWireLogOpen}>
          <RpcWireLogPanel
            entries={snapshot.rpcCalls}
            onClose={() => {
              setRpcWireLogOpen(false);
            }}
            onCopyError={onClientError}
          />
        </Allotment.Pane>
      </Allotment>
    </Box>
  );
};
