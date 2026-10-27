/**
 * PROTOTYPE (throwaway) — /prototype
 * Question (#163): Does a Radix-style MUI specimen catalog under draft desktop chrome
 * work for judging shared theme restyles outside product screens?
 * Single page; no ?variant= switcher. Draft chrome overlays the active Theme preference palette.
 */
import Box from '@mui/material/Box';
import { ThemeProvider, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { FC } from 'react';

import { createPrototypeDesktopChromeTheme } from '../prototype/createPrototypeDesktopChromeTheme.ts';
import { MuiComponentPlayground } from '../prototype/MuiComponentPlayground.tsx';

const PrototypePage: FC = () => {
  const baseTheme = useTheme();
  const prototypeTheme = useMemo(() => createPrototypeDesktopChromeTheme(baseTheme), [baseTheme]);

  return (
    <ThemeProvider noSsr theme={prototypeTheme}>
      <Box
        sx={{
          bgcolor: 'background.default',
          color: 'text.primary',
          minHeight: '100vh',
          pb: 4,
        }}
      >
        <Box
          sx={{
            alignItems: 'center',
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            gap: 2,
            justifyContent: 'space-between',
            px: 2,
            py: 1,
          }}
        >
          <Typography variant="subtitle2">PROTOTYPE · #163 MUI playground</Typography>
          <Link style={{ color: 'inherit', fontSize: 13 }} to="/">
            ← Back to app
          </Link>
        </Box>
        <MuiComponentPlayground />
      </Box>
    </ThemeProvider>
  );
};

export const Route = createFileRoute('/prototype')({
  component: PrototypePage,
});
