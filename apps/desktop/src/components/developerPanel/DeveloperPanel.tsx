import type { SessionSnapshot } from '@lib/ui';
import { DEVELOPER_PANEL_HEIGHT, DeveloperPanelShell } from '@lib/ui';
import type { FC } from 'react';

export { DEVELOPER_PANEL_HEIGHT };

export const DeveloperPanel: FC<{
  readonly initializeResult: unknown;
  readonly onClose: () => void;
  readonly onCopyError: (error: unknown) => void;
  readonly session?: SessionSnapshot;
}> = ({ initializeResult, onClose, onCopyError, session }) => (
  <DeveloperPanelShell
    initializeResult={initializeResult}
    onClose={onClose}
    onCopyError={onCopyError}
    session={session}
  />
);
