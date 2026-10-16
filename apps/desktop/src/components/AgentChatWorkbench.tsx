import 'allotment/dist/style.css';

import { useAtomValue } from '@effect/atom-react';
import {
  DEVELOPER_PANEL_HEIGHT,
  DeveloperPanelShell,
  isRecord,
  OpenDeveloperPanelButton,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  SessionChatBody,
  useDeveloperPanelOpen,
} from '@lib/ui';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { Allotment } from 'allotment';
import { useRef, useState } from 'react';
import type { FC } from 'react';

import { RIGHT_PANEL_WIDTH, RightPanelPlaceholder } from './rightPanel/BootstrapStatePanel.tsx';
import { WORKBENCH_NAV_RAIL_WIDTH, WorkbenchNavRail } from './workbenchNavRail/WorkbenchNavRail.tsx';

const WORKBENCH_LAYOUT_KEY = 'agent-chat-workbench-layout';
const TANSTACK_ROUTER_TAB = 'tanstack-router' as const;

type WorkbenchLayout = {
  readonly horizontalSizes?: readonly number[];
  readonly sessionRosterOpen: boolean;
  readonly sessionStateOpen: boolean;
  readonly verticalSizes?: readonly number[];
};

const DEFAULT_WORKBENCH_LAYOUT: WorkbenchLayout = {
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
  const { close: closeDeveloperPanel, onPaneVisibleChange, visible: developerPanelVisible } = useDeveloperPanelOpen();
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

  return (
    <Box
      sx={theme => ({
        // Allotment hover sash uses --focus-border (default #007fd4); bind to theme primary
        '--focus-border': theme.palette.primary.main,
        '--separator-border': theme.palette.divider,
        '& .sash': {
          backgroundColor: 'transparent',
        },
        '& .sash-active': {
          backgroundColor: 'primary.main',
        },
        '& .sash-hover': {
          backgroundColor: 'primary.main',
        },
        '& .split-view-separator-border > .split-view-container > .split-view-view:not(:first-of-type)::before': {
          backgroundColor: 'divider',
        },
        bgcolor: 'background.default',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      })}
    >
      <Allotment
        defaultSizes={layout.verticalSizes === undefined ? undefined : [...layout.verticalSizes]}
        onChange={sizes => {
          commitLayout({ verticalSizes: sizes }, false);
        }}
        onVisibleChange={onPaneVisibleChange}
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
                    <OpenDeveloperPanelButton />
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

                <SessionChatBody onClientError={onClientError} />
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

        <Allotment.Pane minSize={120} preferredSize={DEVELOPER_PANEL_HEIGHT} snap visible={developerPanelVisible}>
          <DeveloperPanelShell
            extraTabs={[
              {
                content: (
                  <TanStackRouterDevtoolsPanel
                    style={{ height: '100%', maxHeight: '100%', overflow: 'auto', width: '100%' }}
                  />
                ),
                id: TANSTACK_ROUTER_TAB,
                label: 'TanStack Router',
              },
            ]}
            initializeResult={selectedSnapshot?.initializeResult}
            onClose={closeDeveloperPanel}
            onCopyError={onClientError}
            session={selectedSession}
          />
        </Allotment.Pane>
      </Allotment>
    </Box>
  );
};
