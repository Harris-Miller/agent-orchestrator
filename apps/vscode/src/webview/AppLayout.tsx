import 'allotment/dist/style.css';

import { useAtomValue } from '@effect/atom-react';
import {
  DEVELOPER_PANEL_HEIGHT,
  developerModeAtom,
  isRecord,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
} from '@lib/ui';
import Box from '@mui/material/Box';
import { Outlet } from '@tanstack/react-router';
import { Allotment } from 'allotment';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { FC } from 'react';

import { AppLayoutContext } from './appLayoutContext.ts';
import { DeveloperPanel } from './DeveloperPanel.tsx';
import { OnClientErrorContext } from './onClientError.tsx';

const LAYOUT_KEY = 'ao-vscode-app-layout';

type AppLayoutState = {
  readonly developerPanelOpen: boolean;
  readonly verticalSizes?: readonly number[];
};

const DEFAULT_LAYOUT: AppLayoutState = {
  developerPanelOpen: false,
};

const isFiniteNumberArray = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every(item => typeof item === 'number' && Number.isFinite(item));

const loadLayout = (): AppLayoutState => {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw == null) {
      // Migrate one-shot from the #92 key if present.
      const legacy = localStorage.getItem('ao-vscode-developer-panel-layout');
      if (legacy != null) {
        localStorage.setItem(LAYOUT_KEY, legacy);
        localStorage.removeItem('ao-vscode-developer-panel-layout');
        const parsed: unknown = JSON.parse(legacy);
        if (isRecord(parsed)) {
          return {
            developerPanelOpen:
              typeof parsed.developerPanelOpen === 'boolean'
                ? parsed.developerPanelOpen
                : DEFAULT_LAYOUT.developerPanelOpen,
            verticalSizes: isFiniteNumberArray(parsed.verticalSizes, 2) ? parsed.verticalSizes : undefined,
          };
        }
      }
      return DEFAULT_LAYOUT;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return DEFAULT_LAYOUT;
    }
    return {
      developerPanelOpen:
        typeof parsed.developerPanelOpen === 'boolean' ? parsed.developerPanelOpen : DEFAULT_LAYOUT.developerPanelOpen,
      verticalSizes: isFiniteNumberArray(parsed.verticalSizes, 2) ? parsed.verticalSizes : undefined,
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
  const developerMode = useAtomValue(developerModeAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const selectedSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const onClientError = useContext(OnClientErrorContext);

  const commitLayout = useCallback((patch: Partial<AppLayoutState>, rerender = true) => {
    const next = { ...layoutRef.current, ...patch };
    layoutRef.current = next;
    saveLayout(next);
    if (rerender) {
      setLayout(next);
    }
  }, []);

  useEffect(() => {
    if (!developerMode && layoutRef.current.developerPanelOpen) {
      commitLayout({ developerPanelOpen: false });
    }
  }, [commitLayout, developerMode]);

  const api = useMemo(
    () => ({
      developerPanelOpen: layout.developerPanelOpen,
      openDeveloperPanel: () => {
        commitLayout({ developerPanelOpen: true });
      },
    }),
    [commitLayout, layout.developerPanelOpen],
  );

  return (
    <AppLayoutContext.Provider value={api}>
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
              commitLayout({ developerPanelOpen: visible });
            }
          }}
          vertical
        >
          <Allotment.Pane>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
              <Outlet />
            </Box>
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
    </AppLayoutContext.Provider>
  );
};
