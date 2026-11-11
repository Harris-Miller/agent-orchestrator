import { PanelHeader, ToggleDeveloperPanelButton } from '@lib/ui';
import Box from '@mui/material/Box';
import { PanelRightClose } from 'lucide-react';
import type { FC } from 'react';

export const RIGHT_PANEL_WIDTH = 380;

/** Flip to `true` when the first Story lands content in the right panel; until then it (and its open button) stay unrendered. */
export const RIGHT_PANEL_ENABLED = false;

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
    <PanelHeader
      beforeClose={<ToggleDeveloperPanelButton />}
      closeAriaLabel="Close session state panel"
      closeIcon={PanelRightClose}
      onClose={onClose}
      title="Panel"
    />
  </Box>
);
