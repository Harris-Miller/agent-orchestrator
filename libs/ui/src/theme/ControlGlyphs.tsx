import Box from '@mui/material/Box';
import type { FC } from 'react';

export const CheckGlyph: FC<{ readonly checked?: boolean; readonly mixed?: boolean }> = ({ checked, mixed }) => (
  <Box
    aria-hidden="true"
    component="svg"
    viewBox="0 0 16 16"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      flexShrink: 0,
      width: 16,
      height: 16,
      borderRadius: '4px',
    }}
  >
    <rect
      x="0.5"
      y="0.5"
      width="15"
      height="15"
      rx="3.5"
      stroke="currentColor"
      fill={checked || mixed ? 'currentColor' : 'none'}
    />
    {checked || mixed ? (
      <Box component="g" sx={{ color: 'primary.contrastText' }}>
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
    component="svg"
    viewBox="0 0 16 16"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      flexShrink: 0,
      width: 16,
      height: 16,
      borderRadius: '50%',
    }}
  >
    <circle cx="8" cy="8" r="7.5" stroke="currentColor" fill="none" />
    {checked ? <circle cx="8" cy="8" r="4" fill="currentColor" /> : null}
  </Box>
);
