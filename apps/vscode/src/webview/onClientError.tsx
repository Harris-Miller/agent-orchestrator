import { createContext } from 'react';

/** App-shell Snackbar reporter; required by History + Chat. */
export const OnClientErrorContext = createContext<(error: unknown) => void>(() => undefined);
