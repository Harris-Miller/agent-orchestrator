import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';

const formatClientError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** One host-level error reporter: `onClientError` shows the message in `clientErrorSnackbar`, which the host renders once. */
export const useClientErrorSnackbar = (): {
  readonly clientErrorSnackbar: ReactNode;
  readonly onClientError: (error: unknown) => void;
} => {
  const [clientError, setClientError] = useState<null | string>(null);
  const onClientError = useCallback((error: unknown) => {
    setClientError(formatClientError(error));
  }, []);
  const close = () => {
    setClientError(null);
  };

  return {
    clientErrorSnackbar: (
      <Snackbar
        anchorOrigin={{ horizontal: 'center', vertical: 'bottom' }}
        autoHideDuration={6000}
        onClose={close}
        open={clientError !== null}
      >
        <Alert onClose={close} severity="error" sx={{ width: '100%' }} variant="filled">
          {clientError}
        </Alert>
      </Snackbar>
    ),
    onClientError,
  };
};
