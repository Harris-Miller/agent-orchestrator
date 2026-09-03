import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import type { FC, ReactNode } from 'react';

export const PanelHeader: FC<{
  readonly closeAriaLabel: string;
  readonly closeGlyph: string;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly titleEnd?: ReactNode;
}> = ({ closeAriaLabel, closeGlyph, onClose, title, titleEnd }) => (
  <>
    <Box
      sx={{
        alignItems: 'center',
        display: 'flex',
        flexShrink: 0,
        justifyContent: 'space-between',
        px: 2,
        py: 1.5,
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
    <Divider />
  </>
);
