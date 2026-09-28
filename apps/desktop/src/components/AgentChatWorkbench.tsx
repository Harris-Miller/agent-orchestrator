import 'allotment/dist/style.css';

import { useAtomValue } from '@effect/atom-react';
import { developerModeAtom, isRecord, selectedBackendHarnessSnapshotAtom, selectedSessionAtom } from '@lib/ui';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { Allotment } from 'allotment';
import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

import { DEVELOPER_PANEL_HEIGHT, DeveloperPanel } from './developerPanel/DeveloperPanel.tsx';
import { AgentChatMain } from './mainChat/AgentChatMain.tsx';
import { RIGHT_PANEL_WIDTH, RightPanelPlaceholder } from './rightPanel/BootstrapStatePanel.tsx';
import { WORKBENCH_NAV_RAIL_WIDTH, WorkbenchNavRail } from './workbenchNavRail/WorkbenchNavRail.tsx';

const WORKBENCH_LAYOUT_KEY = 'agent-chat-workbench-layout';

type WorkbenchLayout = {
  readonly developerPanelOpen: boolean;
  readonly horizontalSizes?: readonly number[];
  readonly sessionRosterOpen: boolean;
  readonly sessionStateOpen: boolean;
  readonly verticalSizes?: readonly number[];
};

const DEFAULT_WORKBENCH_LAYOUT: WorkbenchLayout = {
  developerPanelOpen: false,
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
    const developerPanelOpen =
      typeof parsed.developerPanelOpen === 'boolean'
        ? parsed.developerPanelOpen
        : typeof parsed.rpcWireLogOpen === 'boolean'
          ? parsed.rpcWireLogOpen
          : DEFAULT_WORKBENCH_LAYOUT.developerPanelOpen;
    return {
      developerPanelOpen,
      horizontalSizes: isFiniteNumberArray(parsed.horizontalSizes, 3) ? parsed.horizontalSizes : undefined,
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

export const AgentChatWorkbench: FC<{
  readonly onClientError: (error: unknown) => void;
}> = ({ onClientError }) => {
  const [layout, setLayout] = useState(loadWorkbenchLayout);
  const layoutRef = useRef(layout);
  const developerMode = useAtomValue(developerModeAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const selectedSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);

  const commitLayout = (patch: Partial<WorkbenchLayout>, rerender = true) => {
    const next = { ...layoutRef.current, ...patch };
    layoutRef.current = next;
    saveWorkbenchLayout(next);
    if (rerender) {
      setLayout(next);
    }
  };

  useEffect(() => {
    if (!developerMode && layoutRef.current.developerPanelOpen) {
      commitLayout({ developerPanelOpen: false });
    }
  }, [developerMode]);

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
            commitLayout({ developerPanelOpen: visible });
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
              preferredSize={WORKBENCH_NAV_RAIL_WIDTH}
              snap
              visible={layout.sessionRosterOpen}
            >
              <WorkbenchNavRail
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
                    {layout.sessionStateOpen ? null : (
                      <Button
                        onClick={() => {
                          commitLayout({ sessionStateOpen: true });
                        }}
                        size="small"
                        variant="outlined"
                      >
                        Panel
                      </Button>
                    )}
                  </Toolbar>
                </AppBar>

                <AgentChatMain
                  developerMode={developerMode}
                  developerPanelOpen={layout.developerPanelOpen}
                  onClientError={onClientError}
                  onOpenDeveloperPanel={() => {
                    commitLayout({ developerPanelOpen: true });
                  }}
                />
              </Box>
            </Allotment.Pane>

            <Allotment.Pane minSize={240} preferredSize={RIGHT_PANEL_WIDTH} snap visible={layout.sessionStateOpen}>
              <RightPanelPlaceholder
                onClose={() => {
                  commitLayout({ sessionStateOpen: false });
                }}
              />
            </Allotment.Pane>
          </Allotment>
        </Allotment.Pane>

        <Allotment.Pane
          minSize={120}
          preferredSize={DEVELOPER_PANEL_HEIGHT}
          snap
          visible={developerMode ? layout.developerPanelOpen : false}
        >
          <DeveloperPanel
            initializeResult={selectedSnapshot?.initializeResult}
            onClose={() => {
              commitLayout({ developerPanelOpen: false });
            }}
            onCopyError={onClientError}
            session={selectedSession}
          />
        </Allotment.Pane>
      </Allotment>
    </Box>
  );
};
