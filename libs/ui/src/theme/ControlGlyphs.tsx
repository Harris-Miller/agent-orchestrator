import Box from '@mui/material/Box';
import type { FC } from 'react';

export const CheckGlyph: FC<{ readonly checked?: boolean; readonly mixed?: boolean }> = ({ checked, mixed }) => (
  <Box
    aria-hidden="true"
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      flexShrink: 0,
      width: 16,
      height: 16,
      border: '1px solid currentColor',
      borderRadius: '4px',
      bgcolor: checked || mixed ? 'currentColor' : 'transparent',
    }}
  >
    {checked || mixed ? (
      <Box component="svg" viewBox="0 0 16 16" sx={{ width: 14, height: 14, color: 'primary.contrastText' }}>
        <path
          d={mixed ? 'M4 8h8' : 'm3 8 3 3 7-7'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Box>
    ) : null}
  </Box>
);
export const RadioGlyph: FC<{ readonly checked?: boolean }> = ({ checked }) => (
  <Box
    aria-hidden="true"
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      flexShrink: 0,
      width: 16,
      height: 16,
      border: '1px solid currentColor',
      borderRadius: '50%',
    }}
  >
    {checked ? (
      <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'currentColor' }} />
    ) : null}
  </Box>
);
