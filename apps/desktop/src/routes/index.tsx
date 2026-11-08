import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import type { FC } from 'react';

import { AgentChatWorkbench } from '../components/AgentChatWorkbench.tsx';
import { PrototypeSwitcher } from '../components/prototype/PrototypeSwitcher.tsx';
import { NEW_SESSION_VARIANTS } from '../components/workbenchNavRail/NewSessionVariants.prototype.tsx';

const formatClientError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const Index: FC = () => {
  const { variant } = useSearch({ strict: false });
  const [clientError, setClientError] = useState<null | string>(null);

  return (
    <Box sx={{ height: '100vh', overflow: 'hidden' }}>
      <AgentChatWorkbench
        onClientError={error => {
          setClientError(formatClientError(error));
        }}
      />

      <Snackbar
        anchorOrigin={{ horizontal: 'center', vertical: 'bottom' }}
        autoHideDuration={6000}
        onClose={() => {
          setClientError(null);
        }}
        open={clientError !== null}
      >
        <Alert
          onClose={() => {
            setClientError(null);
          }}
          severity="error"
          sx={{ width: '100%' }}
          variant="filled"
        >
          {clientError}
        </Alert>
      </Snackbar>
      {/* PROTOTYPE */}
      <PrototypeSwitcher current={variant ?? 'A'} variants={NEW_SESSION_VARIANTS} />
    </Box>
  );
};

export const Route = createFileRoute('/')({
  component: Index,
  // PROTOTYPE — `?variant=` for NewSessionVariants.prototype.tsx
  validateSearch: (search: Record<string, unknown>): { variant?: string } =>
    typeof search.variant === 'string' ? { variant: search.variant } : {},
});
