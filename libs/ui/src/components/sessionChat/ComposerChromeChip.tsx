import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import Box from '@mui/material/Box';
import type { FC, MouseEvent, ReactNode } from 'react';

/** Pill chip used by composer / handoff Config chrome (F). */
export const ComposerChromeChip: FC<{
  readonly active?: boolean;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly interactive?: boolean;
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
}> = ({ active, children, disabled = false, interactive = true, onClick }) => (
  <Box
    aria-disabled={disabled || undefined}
    component={interactive ? 'button' : 'span'}
    onClick={interactive && !disabled && onClick !== undefined ? onClick : undefined}
    sx={{
      '&:hover': interactive && !disabled ? { bgcolor: 'action.hover' } : undefined,
      alignItems: 'center',
      bgcolor: active === true ? 'action.selected' : 'transparent',
      border: 'none',
      borderRadius: 999,
      color: 'text.secondary',
      cursor: interactive && !disabled ? 'pointer' : 'default',
      display: 'inline-flex',
      font: 'inherit',
      fontSize: 13,
      gap: 0.5,
      opacity: disabled ? 0.5 : 1,
      px: 1,
      py: 0.5,
    }}
    type={interactive ? 'button' : undefined}
  >
    {children}
    {interactive ? <KeyboardArrowDown sx={{ fontSize: 16, opacity: 0.7 }} /> : null}
  </Box>
);
