import { Button } from '@lib/ui';
import type { FC } from 'react';

export const RIGHT_PANEL_WIDTH = 380;

/** Empty right-pane placeholder; content TBD. */
export const RightPanelPlaceholder: FC<{
  readonly onClose: () => void;
}> = ({ onClose }) => (
  <div className="box-border flex h-full min-h-0 flex-col bg-card">
    <div className="ao-pane-header">
      <h2 className="text-lg font-medium">Panel</h2>
      <Button aria-label="Close panel" onClick={onClose} size="icon-sm" variant="ghost">
        ›
      </Button>
    </div>
  </div>
);
