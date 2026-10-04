import 'allotment/dist/style.css';

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  DEVELOPER_PANEL_HEIGHT,
  developerModeAtom,
  developerPanelOpenAtom,
  isRecord,
  readDeveloperPanelOpen,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  useCloseDeveloperPanelWhenModeOff,
} from '@lib/ui';
import Box from '@mui/material/Box';
import { Outlet } from '@tanstack/react-router';
import { Allotment } from 'allotment';
import type { AllotmentHandle } from 'allotment';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { FC } from 'react';

import { DeveloperPanel } from './DeveloperPanel.tsx';
import { OnClientErrorContext } from './onClientError.tsx';

const LAYOUT_KEY = 'ao-vscode-app-layout';
const DEVELOPER_PANE_MIN = 120;

type AppLayoutState = {
  readonly verticalSizes?: readonly number[];
};

const DEFAULT_LAYOUT: AppLayoutState = {};

const isFiniteNumberArray = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every(item => typeof item === 'number' && Number.isFinite(item));

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

const loadLayout = (): AppLayoutState => {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY) ?? localStorage.getItem('ao-vscode-developer-panel-layout');
    if (raw == null) {
      return DEFAULT_LAYOUT;
    }
    if (localStorage.getItem(LAYOUT_KEY) == null) {
      localStorage.setItem(LAYOUT_KEY, raw);
      localStorage.removeItem('ao-vscode-developer-panel-layout');
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return DEFAULT_LAYOUT;
    }
    return {
      verticalSizes: sanitizeVerticalSizes(
        isFiniteNumberArray(parsed.verticalSizes, 2) ? parsed.verticalSizes : undefined,
        readDeveloperPanelOpen(),
      ),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
};

const saveLayout = (layout: AppLayoutState): void => {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
};

/** Root route layout: vertical Allotment (main Outlet + Developer panel). */
export const AppLayout: FC = () => {
  const [layout, setLayout] = useState(loadLayout);
  const layoutRef = useRef(layout);
  const allotmentRef = useRef<AllotmentHandle | null>(null);
  const developerMode = useAtomValue(developerModeAtom);
  const developerPanelOpen = useAtomValue(developerPanelOpenAtom);
  const setDeveloperPanelOpen = useAtomSet(developerPanelOpenAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const selectedSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const onClientError = useContext(OnClientErrorContext);
  const panelVisible = developerMode && developerPanelOpen;
  useCloseDeveloperPanelWhenModeOff();

  const commitLayout = useCallback((patch: Partial<AppLayoutState>, rerender = true) => {
    const next = { ...layoutRef.current, ...patch };
    layoutRef.current = next;
    saveLayout(next);
    if (rerender) {
      setLayout(next);
    }
  }, []);

  // After Allotment applies `visible`, restore preferred height (cached size may be 0).
  useEffect(() => {
    if (!panelVisible) {
      return;
    }
    commitLayout({ verticalSizes: sanitizeVerticalSizes(layoutRef.current.verticalSizes, true) }, false);
    const frame = requestAnimationFrame(() => {
      allotmentRef.current?.reset();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [commitLayout, panelVisible]);

  return (
    <Box
      sx={{
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
            setDeveloperPanelOpen(visible);
          }
        }}
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
          <DeveloperPanel
            initializeResult={selectedSnapshot?.initializeResult}
            onClose={() => {
              setDeveloperPanelOpen(false);
            }}
            onCopyError={onClientError}
            session={selectedSession}
          />
        </Allotment.Pane>
      </Allotment>
    </Box>
  );
};
