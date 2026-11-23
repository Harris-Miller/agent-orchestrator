import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';

import { describeError } from '../host/requestError.ts';
import { Toast } from './Toast.tsx';

/** One host-level error reporter: `onClientError` shows the message in `clientErrorSnackbar`, which the host renders once. */
export const useClientErrorSnackbar = (): {
  readonly clientErrorSnackbar: ReactNode;
  readonly onClientError: (error: unknown) => void;
} => {
  const [clientError, setClientError] = useState<null | string>(null);
  const onClientError = useCallback((error: unknown) => {
    setClientError(describeError(error));
  }, []);
  const close = () => {
    setClientError(null);
  };

  return {
    clientErrorSnackbar: (
      <Toast autoHideDuration={6000} onClose={close} open={clientError !== null} severity="error">
        {clientError}
      </Toast>
    ),
    onClientError,
  };
};
