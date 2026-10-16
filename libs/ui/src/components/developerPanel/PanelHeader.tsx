import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import type { FC, ReactNode } from 'react';

/** Matches themed `MuiAppBar` / `MuiToolbar` chrome height (49px). */
export const PANEL_HEADER_HEIGHT = 49;

export const PanelHeader: FC<{
  readonly closeAriaLabel: string;
  readonly closeGlyph: string;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly titleEnd?: ReactNode;
}> = ({ closeAriaLabel, closeGlyph, onClose, title, titleEnd }) => (
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
    <IconButton aria-label={closeAriaLabel} edge="end" onClick={onClose} size="small">
      <Typography component="span" sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
        {closeGlyph}
      </Typography>
    </IconButton>
  </Box>
);
