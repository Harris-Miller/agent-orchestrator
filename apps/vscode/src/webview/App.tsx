import { RegistryContext, RegistryProvider, useAtomSet, useAtomValue } from '@effect/atom-react';
import { onWorkspaceFoldersChanged, requestWorkspaceFolders } from '@lib/context-services-vscode-webview';
import {
  AcpBackendsMount,
  AppThemeProvider,
  cancelPromptAtomFn,
  deactivateSessionAtomFn,
  refreshAllSessionRostersAtomFn,
  sessionListScopeAtom,
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
import { sessionCwdAtom, workspaceFolderPathsAtom } from './workspaceFolderPaths.atoms.ts';
import { applyWorkspaceFolderPaths, handleWorkspaceFoldersChanged } from './workspaceFoldersChurn.ts';

/** TEMP debug — owned by #92 (DeveloperPanel tab); keep as App-shell sibling until then. */
const WorkspaceCwdDebug: FC = () => {
  const paths = useAtomValue(workspaceFolderPathsAtom);
  const sessionCwd = useAtomValue(sessionCwdAtom);
  const listScope = useAtomValue(sessionListScopeAtom);

  return (
    <Box
      component="pre"
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        flexShrink: 0,
        fontFamily: 'var(--vscode-editor-font-family, monospace)',
        fontSize: 11,
        m: 0,
        p: 1,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      <Typography component="div" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }} variant="caption">
        TEMP workspace cwd
      </Typography>
      {`sessionCwd: ${sessionCwd ?? '(none)'}
listScope: ${JSON.stringify(listScope)}
paths (${paths.length}):
${paths.length === 0 ? '  (empty)' : paths.map(p => `  - ${p}`).join('\n')}`}
    </Box>
  );
};

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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%', minHeight: 0, p: 1 }}>
        <WorkspaceCwdDebug />
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
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
      <WorkspaceFoldersGate />
    </AppThemeProvider>
  </RegistryProvider>
);
