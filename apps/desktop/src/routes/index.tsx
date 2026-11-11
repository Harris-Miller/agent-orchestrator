import { useClientErrorSnackbar } from '@lib/ui';
import Box from '@mui/material/Box';
import { createFileRoute } from '@tanstack/react-router';
import type { FC } from 'react';

import { AgentChatWorkbench } from '../components/AgentChatWorkbench.tsx';

const Index: FC = () => {
  const { clientErrorSnackbar, onClientError } = useClientErrorSnackbar();

  return (
    <Box sx={{ height: '100vh', overflow: 'hidden' }}>
      <AgentChatWorkbench onClientError={onClientError} />
      {clientErrorSnackbar}
    </Box>
  );
};

export const Route = createFileRoute('/')({
  component: Index,
});
