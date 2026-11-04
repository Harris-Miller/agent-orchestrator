import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import type { LucideIcon } from 'lucide-react';
import type { FC, ReactNode } from 'react';

import { PANEL_HEADER_HEIGHT } from '../../theme/tokens.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

export const PanelHeader: FC<{
  readonly actions?: ReactNode;
  readonly closeAriaLabel: string;
  readonly closeIcon: LucideIcon;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly titleEnd?: ReactNode;
}> = ({ actions, closeAriaLabel, closeIcon, onClose, title, titleEnd }) => (
  <Box
    sx={{
      alignItems: 'center',
      borderBottom: 1,
      borderColor: 'divider',
      boxSizing: 'border-box',
      display: 'flex',
      flexShrink: 0,
      justifyContent: 'space-between',
      minHeight: PANEL_HEADER_HEIGHT,
      px: 2,
    }}
  >
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.5, minWidth: 0 }}>
      {typeof title === 'string' ? <Typography variant="h6">{title}</Typography> : title}
      {titleEnd}
    </Box>
    <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.5 }}>
      {actions}
      <IconButton aria-label={closeAriaLabel} edge="end" onClick={onClose} size="small">
        <LucideMuiIcon fontSize="small" icon={closeIcon} />
      </IconButton>
    </Box>
  </Box>
);
