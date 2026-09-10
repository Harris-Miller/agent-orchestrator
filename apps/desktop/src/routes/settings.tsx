import Box from '@mui/material/Box';
import { createFileRoute } from '@tanstack/react-router';

import { SettingsPrototypePage } from '../components/settings/prototype/settingsPrototypeVariants.tsx';

export const Route = createFileRoute('/settings')({
  component: () => (
    <Box sx={{ height: '100vh', overflow: 'hidden' }}>
      <SettingsPrototypePage />
    </Box>
  ),
});
