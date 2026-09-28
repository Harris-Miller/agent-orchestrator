import { RegistryProvider } from '@effect/atom-react';
import { AcpBackendsMount, AppThemeProvider, ProvidersSettingsPane, UserSettingsMount } from '@lib/ui';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import type { FC } from 'react';

export const App: FC = () => (
  <RegistryProvider>
    <AppThemeProvider>
      <CssBaseline />
      <AcpBackendsMount />
      <UserSettingsMount />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>
        <ProvidersSettingsPane />
      </Box>
    </AppThemeProvider>
  </RegistryProvider>
);
