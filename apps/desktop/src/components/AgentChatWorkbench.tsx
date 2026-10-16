import 'allotment/dist/style.css';

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  AgentLaunchTargetIcon,
  allotmentSashSx,
  DEVELOPER_PANEL_HEIGHT,
  DeveloperPanelShell,
  ensureVirtualSessionAtomFn,
  isRecord,
  OpenDeveloperPanelButton,
  PANEL_HEADER_HEIGHT,
  selectedAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  SessionChatBody,
  sessionChatTitle,
  unifiedSessionRosterAtom,
  useDeveloperPanelOpen,
  virtualSessionAtom,
} from '@lib/ui';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { Allotment } from 'allotment';
import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

import { RIGHT_PANEL_WIDTH, RightPanelPlaceholder } from './rightPanel/BootstrapStatePanel.tsx';
import { VirtualProjectChrome } from './VirtualProjectChrome.tsx';
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
  const selected = useAtomValue(selectedAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const selectedSessionLaunchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const selectedSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const virtualSession = useAtomValue(virtualSessionAtom);
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });

  const isVirtual = selected?._tag === 'Virtual';
  const launchTarget = isVirtual ? virtualSession?.launchTarget : selectedSessionLaunchTarget;
  const entry = selectedSessionId === undefined ? undefined : roster.find(row => row.sessionId === selectedSessionId);
  const title = sessionChatTitle(isVirtual, entry, launchTarget);

  useEffect(() => {
    ensureVirtualSession(undefined).catch(() => undefined);
  }, [ensureVirtualSession]);

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
        ...allotmentSashSx(theme),
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
                <Box
                  sx={{
                    alignItems: 'center',
                    bgcolor: 'background.paper',
                    borderBottom: 1,
                    borderColor: 'divider',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexShrink: 0,
                    gap: 1,
                    minHeight: PANEL_HEADER_HEIGHT,
                    px: 2,
                  }}
                >
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
                  {launchTarget === undefined ? null : <AgentLaunchTargetIcon launchTarget={launchTarget} />}
                  <Typography noWrap sx={{ flexGrow: 1 }} variant="h6">
                    {title}
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
                </Box>

                <SessionChatBody aboveComposer={<VirtualProjectChrome />} onClientError={onClientError} />
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
