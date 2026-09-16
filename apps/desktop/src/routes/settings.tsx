import Box from '@mui/material/Box';
import { createFileRoute } from '@tanstack/react-router';

import { SettingsPage } from '../components/settings/SettingsPage.tsx';

export const Route = createFileRoute('/settings')({
  component: () => (
    <Box sx={{ height: '100vh', overflow: 'hidden' }}>
      <SettingsPage />
    </Box>
  ),
});
