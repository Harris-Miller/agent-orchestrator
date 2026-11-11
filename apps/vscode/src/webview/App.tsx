import { RegistryContext, RegistryProvider } from '@effect/atom-react';
import { onWorkspaceFoldersChanged, requestWorkspaceFolders } from '@lib/context-services-vscode-webview';
import {
  AppThemeProvider,
  bootWorkspaceFolders,
  handleWorkspaceFoldersChanged,
  HarnessMounts,
  HarnessPrerequisites,
  hostThemeAtom,
  readVscodeTheme,
  useClientErrorSnackbar,
} from '@lib/ui';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { RouterProvider } from '@tanstack/react-router';
import { Effect } from 'effect';
import { useContext, useEffect, useState } from 'react';
import type { FC } from 'react';

import { hostIpcClient } from './bindHostRuntime.ts';
import { OnClientErrorContext } from './onClientError.tsx';
import { router } from './router.tsx';
import { VscodeThemeSync } from './VscodeThemeSync.tsx';

const WorkspaceFoldersGate: FC = () => {
  const registry = useContext(RegistryContext);
  const [foldersReady, setFoldersReady] = useState(false);
  const { clientErrorSnackbar, onClientError } = useClientErrorSnackbar();

  useEffect(() => {
    let cancelled = false;
    let disposeChanged: (() => void) | undefined;

    Effect.runFork(
      Effect.gen(function* () {
        const paths = yield* requestWorkspaceFolders(hostIpcClient);
        yield* bootWorkspaceFolders(registry, paths);
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            if (cancelled) {
              return;
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
      <HarnessMounts />
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
      {clientErrorSnackbar}
    </OnClientErrorContext.Provider>
  );
};

/** VS Code writes its `--vscode-*` variables before the bundle runs, so the first paint already has the theme. */
const initialHostTheme = readVscodeTheme(document);

export const App: FC = () => (
  <RegistryProvider initialValues={[[hostThemeAtom, initialHostTheme]]}>
    <VscodeThemeSync />
    <AppThemeProvider>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <HarnessPrerequisites
          onExit={() => {
            Effect.runPromise(hostIpcClient.request({ _tag: 'AppExit' })).catch(() => undefined);
          }}
        >
          <WorkspaceFoldersGate />
        </HarnessPrerequisites>
      </Box>
    </AppThemeProvider>
  </RegistryProvider>
);
