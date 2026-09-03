/**
 * PROTOTYPE — simple MUI agent chat surface for the ACP harness.
 */
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import { useState } from 'react';
import type { FC } from 'react';

import { AgentChatWorkbench } from './AgentChatWorkbench.tsx';

const formatClientError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const AgentChatPrototype: FC = () => {
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
    </Box>
  );
};
