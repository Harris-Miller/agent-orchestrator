import { PanelHeader } from '@lib/ui';
import Box from '@mui/material/Box';
import type { FC } from 'react';

export const RIGHT_PANEL_WIDTH = 380;

/** Empty right-pane placeholder; content TBD. */
export const RightPanelPlaceholder: FC<{
  readonly onClose: () => void;
}> = ({ onClose }) => (
  <Box
    sx={{
      bgcolor: 'background.paper',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }}
  >
    <PanelHeader closeAriaLabel="Close panel" closeGlyph="›" onClose={onClose} title="Panel" />
  </Box>
);
