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
import { useRef, useState } from 'react';
import type { FC } from 'react';

import { isRecord } from '../../utils.ts';

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

const WORKBENCH_LAYOUT_KEY = 'agent-chat-workbench-layout';

type WorkbenchLayout = {
  readonly horizontalSizes?: readonly number[];
  readonly rpcWireLogOpen: boolean;
  readonly sessionRosterOpen: boolean;
  readonly sessionStateOpen: boolean;
  readonly verticalSizes?: readonly number[];
};

const DEFAULT_WORKBENCH_LAYOUT: WorkbenchLayout = {
  rpcWireLogOpen: false,
  sessionRosterOpen: true,
  sessionStateOpen: true,
};

const isFiniteNumberArray = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every(item => typeof item === 'number' && Number.isFinite(item));

const loadWorkbenchLayout = (): WorkbenchLayout => {
  try {
    const raw = localStorage.getItem(WORKBENCH_LAYOUT_KEY);
    if (raw == null) {
      return DEFAULT_WORKBENCH_LAYOUT;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return DEFAULT_WORKBENCH_LAYOUT;
    }
    return {
      horizontalSizes: isFiniteNumberArray(parsed.horizontalSizes, 3) ? parsed.horizontalSizes : undefined,
      rpcWireLogOpen:
        typeof parsed.rpcWireLogOpen === 'boolean' ? parsed.rpcWireLogOpen : DEFAULT_WORKBENCH_LAYOUT.rpcWireLogOpen,
      sessionRosterOpen:
        typeof parsed.sessionRosterOpen === 'boolean'
          ? parsed.sessionRosterOpen
          : DEFAULT_WORKBENCH_LAYOUT.sessionRosterOpen,
      sessionStateOpen:
        typeof parsed.sessionStateOpen === 'boolean'
          ? parsed.sessionStateOpen
          : DEFAULT_WORKBENCH_LAYOUT.sessionStateOpen,
      verticalSizes: isFiniteNumberArray(parsed.verticalSizes, 2) ? parsed.verticalSizes : undefined,
    };
  } catch {
    return DEFAULT_WORKBENCH_LAYOUT;
  }
};

const saveWorkbenchLayout = (layout: WorkbenchLayout): void => {
  localStorage.setItem(WORKBENCH_LAYOUT_KEY, JSON.stringify(layout));
};

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
  const [layout, setLayout] = useState(loadWorkbenchLayout);
  const layoutRef = useRef(layout);
  const [selectedBackend, setSelectedBackend] = useAtom(selectedBackendAtom);
  const snapshot = useAtomValue(activeSnapshotAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const backendPhases = useAtomValue(allBackendPhasesAtom);
  const restartBackend = useAtomSet(restartBackendFn, { mode: 'promise' });

  const commitLayout = (patch: Partial<WorkbenchLayout>, rerender = true) => {
    const next = { ...layoutRef.current, ...patch };
    layoutRef.current = next;
    saveWorkbenchLayout(next);
    if (rerender) {
      setLayout(next);
    }
  };

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
        defaultSizes={layout.verticalSizes === undefined ? undefined : [...layout.verticalSizes]}
        onChange={sizes => {
          commitLayout({ verticalSizes: sizes }, false);
        }}
        onVisibleChange={(index, visible) => {
          if (index === 1) {
            commitLayout({ rpcWireLogOpen: visible });
          }
        }}
        vertical
      >
        <Allotment.Pane>
          <Allotment
            defaultSizes={layout.horizontalSizes === undefined ? undefined : [...layout.horizontalSizes]}
            onChange={sizes => {
              commitLayout({ horizontalSizes: sizes }, false);
            }}
            onVisibleChange={(index, visible) => {
              if (index === 0) {
                commitLayout({ sessionRosterOpen: visible });
              } else if (index === 2) {
                commitLayout({ sessionStateOpen: visible });
              }
            }}
          >
            <Allotment.Pane
              minSize={200}
              preferredSize={SESSION_ROSTER_PANEL_WIDTH}
              snap
              visible={layout.sessionRosterOpen}
            >
              <SessionRosterPanel
                backend={selectedBackend}
                onClose={() => {
                  commitLayout({ sessionRosterOpen: false });
                }}
              />
            </Allotment.Pane>

            <Allotment.Pane minSize={280}>
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
                <AppBar position="static" sx={{ flexShrink: 0 }}>
                  <Toolbar sx={{ gap: 1 }}>
                    {layout.sessionRosterOpen ? null : (
                      <Button
                        onClick={() => {
                          commitLayout({ sessionRosterOpen: true });
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
                    {layout.sessionStateOpen ? null : (
                      <Button
                        onClick={() => {
                          commitLayout({ sessionStateOpen: true });
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
                    commitLayout({ rpcWireLogOpen: true });
                  }}
                  rpcWireLogOpen={layout.rpcWireLogOpen}
                />
              </Box>
            </Allotment.Pane>

            <Allotment.Pane
              minSize={240}
              preferredSize={SESSION_STATE_PANEL_WIDTH}
              snap
              visible={layout.sessionStateOpen}
            >
              <BootstrapStatePanel
                initializeResult={snapshot.initializeResult}
                onClose={() => {
                  commitLayout({ sessionStateOpen: false });
                }}
                session={selectedSession}
              />
            </Allotment.Pane>
          </Allotment>
        </Allotment.Pane>

        <Allotment.Pane minSize={120} preferredSize={RPC_WIRE_LOG_PANEL_HEIGHT} snap visible={layout.rpcWireLogOpen}>
          <RpcWireLogPanel
            entries={snapshot.rpcCalls}
            onClose={() => {
              commitLayout({ rpcWireLogOpen: false });
            }}
            onCopyError={onClientError}
          />
        </Allotment.Pane>
      </Allotment>
    </Box>
  );
};
