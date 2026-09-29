import { createContext } from 'react';

/** App-shell Snackbar reporter; required by History + Chat. */
export const OnClientErrorContext = createContext<(error: unknown) => void>(() => undefined);

export const formatClientError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};
