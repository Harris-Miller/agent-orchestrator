import 'allotment/dist/style.css';

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  allotmentSashSx,
  DEVELOPER_PANEL_HEIGHT,
  DeveloperPanelShell,
  ensureVirtualSessionAtomFn,
  IconTooltipButton,
  isFiniteNumberArray,
  PANEL_HEADER_HEIGHT,
  selectedAtom,
  selectedSessionAtom,
  SessionChatBody,
  SessionHeader,
  ToggleDeveloperPanelButton,
  useDeveloperPanelOpen,
  usePersistedLayout,
  virtualMaterializingAtom,
} from '@lib/ui';
import Box from '@mui/material/Box';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { Allotment } from 'allotment';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { useEffect } from 'react';
import type { FC } from 'react';

import { RIGHT_PANEL_ENABLED, RIGHT_PANEL_WIDTH, RightPanelPlaceholder } from './rightPanel/BootstrapStatePanel.tsx';
import { SessionCwdStrip } from './SessionCwdStrip.tsx';
import { WORKBENCH_NAV_RAIL_WIDTH, WorkbenchNavRail } from './workbenchNavRail/WorkbenchNavRail.tsx';

const WORKBENCH_LAYOUT_KEY = 'agent-chat-workbench-layout';
const TANSTACK_ROUTER_TAB = 'tanstack-router' as const;
const HORIZONTAL_PANE_COUNT = RIGHT_PANEL_ENABLED ? 3 : 2;

type WorkbenchLayout = {
  readonly horizontalSizes?: readonly number[];
  readonly sessionHistoryOpen: boolean;
  readonly sessionStateOpen: boolean;
  readonly verticalSizes?: readonly number[];
};

const DEFAULT_WORKBENCH_LAYOUT: WorkbenchLayout = {
  sessionHistoryOpen: true,
  sessionStateOpen: true,
};

const parseWorkbenchLayout = (raw: Record<string, unknown>): WorkbenchLayout => ({
  horizontalSizes: isFiniteNumberArray(raw.horizontalSizes, HORIZONTAL_PANE_COUNT) ? raw.horizontalSizes : undefined,
  sessionHistoryOpen:
    typeof raw.sessionHistoryOpen === 'boolean' ? raw.sessionHistoryOpen : DEFAULT_WORKBENCH_LAYOUT.sessionHistoryOpen,
  sessionStateOpen:
    typeof raw.sessionStateOpen === 'boolean' ? raw.sessionStateOpen : DEFAULT_WORKBENCH_LAYOUT.sessionStateOpen,
  verticalSizes: isFiniteNumberArray(raw.verticalSizes, 2) ? raw.verticalSizes : undefined,
});

export const AgentChatWorkbench: FC<{
  readonly onClientError: (error: unknown) => void;
}> = ({ onClientError }) => {
  const { commit: commitLayout, layout } = usePersistedLayout({
    key: WORKBENCH_LAYOUT_KEY,
    parse: parseWorkbenchLayout,
  });
  const { close: closeDeveloperPanel, onPaneVisibleChange, visible: developerPanelVisible } = useDeveloperPanelOpen();
  const selectedSession = useAtomValue(selectedSessionAtom);
  const selected = useAtomValue(selectedAtom);
  const virtualMaterializing = useAtomValue(virtualMaterializingAtom);
  const ensureVirtualSession = useAtomSet(ensureVirtualSessionAtomFn, { mode: 'promise' });

  // Desktop keeps Virtual or a Session Selected: fall back to Virtual whenever Selected is cleared (boot, Archive,
  // Delete, Deactivate). Re-runs when Materialize ends, since ensureVirtual is inert under the Lifecycle lock.
  useEffect(() => {
    if (selected === undefined && !virtualMaterializing) {
      ensureVirtualSession(undefined).catch(() => undefined);
    }
  }, [selected, virtualMaterializing, ensureVirtualSession]);

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
                commitLayout({ sessionHistoryOpen: visible });
              } else if (index === 2) {
                commitLayout({ sessionStateOpen: visible });
              }
            }}
          >
            <Allotment.Pane
              minSize={200}
              preferredSize={WORKBENCH_NAV_RAIL_WIDTH}
              snap
              visible={layout.sessionHistoryOpen}
            >
              <WorkbenchNavRail
                onClientError={onClientError}
                onClose={() => {
                  commitLayout({ sessionHistoryOpen: false });
                }}
              />
            </Allotment.Pane>

            <Allotment.Pane minSize={280}>
              <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
                <Box
                  sx={{
                    alignItems: 'center',
                    bgcolor: 'background.paper',
                    borderColor: 'divider',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexShrink: 0,
                    gap: 1,
                    height: PANEL_HEADER_HEIGHT,
                    px: 2,
                  }}
                >
                  {layout.sessionHistoryOpen ? null : (
                    <IconTooltipButton
                      icon={PanelLeftOpen}
                      label="Open session history panel"
                      onClick={() => {
                        commitLayout({ sessionHistoryOpen: true });
                      }}
                    />
                  )}
                  <SessionHeader onClientError={onClientError} titleProps={{ variant: 'h6' }} />
                  {RIGHT_PANEL_ENABLED && layout.sessionStateOpen ? null : (
                    <>
                      <ToggleDeveloperPanelButton />
                      {RIGHT_PANEL_ENABLED ? (
                        <IconTooltipButton
                          icon={PanelRightOpen}
                          label="Open session state panel"
                          onClick={() => {
                            commitLayout({ sessionStateOpen: true });
                          }}
                        />
                      ) : null}
                    </>
                  )}
                </Box>

                <SessionChatBody
                  aboveComposer={<SessionCwdStrip onClientError={onClientError} />}
                  onClientError={onClientError}
                />
              </Box>
            </Allotment.Pane>

            {RIGHT_PANEL_ENABLED ? (
              <Allotment.Pane minSize={240} preferredSize={RIGHT_PANEL_WIDTH} snap visible={layout.sessionStateOpen}>
                <RightPanelPlaceholder
                  onClose={() => {
                    commitLayout({ sessionStateOpen: false });
                  }}
                />
              </Allotment.Pane>
            ) : null}
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
            onClose={closeDeveloperPanel}
            onCopyError={onClientError}
            session={selectedSession}
          />
        </Allotment.Pane>
      </Allotment>
    </Box>
  );
};
