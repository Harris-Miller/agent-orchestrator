import 'allotment/dist/style.css';

import { useAtomValue } from '@effect/atom-react';
import {
  allotmentSashSx,
  DEVELOPER_PANEL_HEIGHT,
  isFiniteNumberArray,
  readDeveloperPanelOpen,
  selectedSessionAtom,
  useDeveloperPanelOpen,
  usePersistedLayout,
} from '@lib/ui';
import Box from '@mui/material/Box';
import { Outlet } from '@tanstack/react-router';
import { Allotment } from 'allotment';
import type { AllotmentHandle } from 'allotment';
import { useContext, useEffect, useRef } from 'react';
import type { FC } from 'react';

import { DeveloperPanel } from './DeveloperPanel.tsx';
import { OnClientErrorContext } from './onClientError.tsx';

const LAYOUT_KEY = 'hoa-vscode-app-layout';
const DEVELOPER_PANE_MIN = 120;

type AppLayoutState = {
  readonly verticalSizes?: readonly number[];
};

/** Drop collapsed bottom-pane sizes so preferredSize can apply on open. */
const sanitizeVerticalSizes = (
  sizes: readonly number[] | undefined,
  developerPanelOpen: boolean,
): readonly number[] | undefined => {
  if (sizes === undefined) {
    return undefined;
  }
  if (!developerPanelOpen || sizes[1] >= DEVELOPER_PANE_MIN) {
    return sizes;
  }
  return undefined;
};

const parseLayout = (raw: Record<string, unknown>): AppLayoutState => ({
  verticalSizes: sanitizeVerticalSizes(
    isFiniteNumberArray(raw.verticalSizes, 2) ? raw.verticalSizes : undefined,
    readDeveloperPanelOpen(),
  ),
});

/** Root route layout: vertical Allotment (main Outlet + Developer panel). */
export const AppLayout: FC = () => {
  const {
    commit: commitLayout,
    latest: latestLayout,
    layout,
  } = usePersistedLayout({
    key: LAYOUT_KEY,
    parse: parseLayout,
  });
  const allotmentRef = useRef<AllotmentHandle | null>(null);
  const { close: closeDeveloperPanel, onPaneVisibleChange, visible: panelVisible } = useDeveloperPanelOpen();
  const selectedSession = useAtomValue(selectedSessionAtom);
  const onClientError = useContext(OnClientErrorContext);

  // After Allotment applies `visible`, restore preferred height (cached size may be 0).
  useEffect(() => {
    if (!panelVisible) {
      return;
    }
    commitLayout({ verticalSizes: sanitizeVerticalSizes(latestLayout().verticalSizes, true) }, false);
    const frame = requestAnimationFrame(() => {
      allotmentRef.current?.reset();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [commitLayout, latestLayout, panelVisible]);

  return (
    <Box
      sx={theme => ({
        ...allotmentSashSx(theme),
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
        ref={allotmentRef}
        vertical
      >
        <Allotment.Pane key="main">
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
            <Outlet />
          </Box>
        </Allotment.Pane>
        <Allotment.Pane
          key="developer"
          minSize={DEVELOPER_PANE_MIN}
          preferredSize={DEVELOPER_PANEL_HEIGHT}
          snap
          visible={panelVisible}
        >
          <DeveloperPanel onClose={closeDeveloperPanel} onCopyError={onClientError} session={selectedSession} />
        </Allotment.Pane>
      </Allotment>
    </Box>
  );
};
