import type { SessionSnapshot } from '@lib/ui';
import { DEVELOPER_PANEL_HEIGHT, DeveloperPanelShell } from '@lib/ui';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import type { FC } from 'react';

export { DEVELOPER_PANEL_HEIGHT };

const TANSTACK_ROUTER_TAB = 'tanstack-router' as const;

export const DeveloperPanel: FC<{
  readonly initializeResult: unknown;
  readonly onClose: () => void;
  readonly onCopyError: (error: unknown) => void;
  readonly session?: SessionSnapshot;
}> = ({ initializeResult, onClose, onCopyError, session }) => (
  <DeveloperPanelShell
    extraTabs={[
      {
        content: (
          <TanStackRouterDevtoolsPanel style={{ height: '100%', maxHeight: '100%', overflow: 'auto', width: '100%' }} />
        ),
        id: TANSTACK_ROUTER_TAB,
        label: 'TanStack Router',
      },
    ]}
    initializeResult={initializeResult}
    onClose={onClose}
    onCopyError={onCopyError}
    session={session}
  />
);
