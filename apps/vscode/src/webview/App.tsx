import { RegistryContext, RegistryProvider, useAtomSet } from '@effect/atom-react';
import { onWorkspaceFoldersChanged, requestWorkspaceFolders } from '@lib/context-services-vscode-webview';
import {
  AcpBackendsMount,
  AppThemeProvider,
  cancelPromptAtomFn,
  deactivateSessionAtomFn,
  ensureVirtualSession,
  FdPrerequisiteGate,
  PersistUserSettingsToast,
  refreshAllSessionRostersAtomFn,
  rwFromRegistry,
  UserSettingsMount,
} from '@lib/ui';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { RouterProvider } from '@tanstack/react-router';
import { Effect } from 'effect';
import { useCallback, useContext, useEffect, useState } from 'react';
import type { FC } from 'react';

import { hostIpcClient } from './bindHostRuntime.ts';
import { formatClientError, OnClientErrorContext } from './onClientError.tsx';
import { router } from './router.tsx';
import { firstFolderPath } from './sessionsMatchingSessionCwd.ts';
import { applyWorkspaceFolderPaths, handleWorkspaceFoldersChanged } from './workspaceFoldersChurn.ts';

const WorkspaceFoldersGate: FC = () => {
  const registry = useContext(RegistryContext);
  useAtomSet(cancelPromptAtomFn);
  useAtomSet(deactivateSessionAtomFn);
  useAtomSet(refreshAllSessionRostersAtomFn);
  const [foldersReady, setFoldersReady] = useState(false);
  const [clientError, setClientError] = useState<null | string>(null);

  useEffect(() => {
    let cancelled = false;
    let disposeChanged: (() => void) | undefined;

    Effect.runFork(
      requestWorkspaceFolders(hostIpcClient).pipe(
        Effect.tap(paths =>
          Effect.sync(() => {
            if (cancelled) {
              return;
            }
            applyWorkspaceFolderPaths(registry, paths);
            const bootCwd = firstFolderPath(paths);
            if (bootCwd !== undefined) {
              ensureVirtualSession(rwFromRegistry(registry), { cwd: bootCwd });
            }
            setFoldersReady(true);
            disposeChanged = onWorkspaceFoldersChanged(hostIpcClient, nextPaths => {
              Effect.runFork(
                handleWorkspaceFoldersChanged(registry, nextPaths).pipe(
                  Effect.catchCause(cause => Effect.logWarning('workspace folders churn failed', cause)),
                ),
              );
            });
          }),
        ),
        Effect.catchCause(cause => Effect.logError('workspace folders boot failed', cause)),
      ),
    );

    return () => {
      cancelled = true;
      disposeChanged?.();
    };
  }, [registry]);

  const onClientError = useCallback((error: unknown) => {
    setClientError(formatClientError(error));
  }, []);

  if (!foldersReady) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2">Loading workspace…</Typography>
      </Stack>
    );
  }

  return (
    <OnClientErrorContext.Provider value={onClientError}>
      <AcpBackendsMount />
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          p: 1,
        }}
      >
        <Box sx={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
          <RouterProvider router={router} />
        </Box>
      </Box>
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
    </OnClientErrorContext.Provider>
  );
};

export const App: FC = () => (
  <RegistryProvider>
    <AppThemeProvider>
      <CssBaseline />
      <UserSettingsMount />
      <PersistUserSettingsToast />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <FdPrerequisiteGate
          onExit={() => {
            Effect.runPromise(hostIpcClient.request(id => ({ _tag: 'AppExit' as const, id }))).catch(() => undefined);
          }}
        >
          <WorkspaceFoldersGate />
        </FdPrerequisiteGate>
      </Box>
    </AppThemeProvider>
  </RegistryProvider>
);
