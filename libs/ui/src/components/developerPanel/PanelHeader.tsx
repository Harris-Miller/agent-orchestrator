import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { LucideIcon } from 'lucide-react';
import type { FC, ReactNode } from 'react';

import { PANEL_HEADER_HEIGHT } from '../../theme/tokens.ts';
import { IconTooltipButton } from '../IconTooltipButton.tsx';

export const PanelHeader: FC<{
  readonly beforeClose?: ReactNode;
  readonly closeAriaLabel: string;
  readonly closeIcon: LucideIcon;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly titleEnd?: ReactNode;
}> = ({ beforeClose, closeAriaLabel, closeIcon, onClose, title, titleEnd }) => (
  <Box
    sx={{
      alignItems: 'center',
      borderColor: 'divider',
      boxSizing: 'border-box',
      display: 'flex',
      flexShrink: 0,
      justifyContent: 'space-between',
      height: PANEL_HEADER_HEIGHT,
      px: 2,
    }}
  >
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.5, minWidth: 0 }}>
      {typeof title === 'string' ? <Typography variant="h6">{title}</Typography> : title}
      {titleEnd}
    </Box>
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
      {beforeClose}
      <IconTooltipButton icon={closeIcon} label={closeAriaLabel} onClick={onClose} />
    </Box>
  </Box>
);
