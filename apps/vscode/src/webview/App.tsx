import { RegistryContext, RegistryProvider, useAtomSet } from '@effect/atom-react';
import { onWorkspaceFoldersChanged, requestWorkspaceFolders } from '@lib/context-services-vscode-webview';
import {
  AcpBackendsMount,
  AppThemeProvider,
  cancelPromptAtomFn,
  deactivateSessionAtomFn,
  ProvidersSettingsPane,
  refreshAllSessionRostersAtomFn,
  UserSettingsMount,
} from '@lib/ui';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import { Effect } from 'effect';
import { useContext, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { hostIpcClient } from './bindHostRuntime.ts';
import { applyWorkspaceFolderPaths, handleWorkspaceFoldersChanged } from './workspaceFoldersChurn.ts';

/**
 * Request Workspace folders before mounting backends; subscribe to Changed after first Result.
 * Providers shell may paint while waiting.
 */
const WorkspaceFoldersGate: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const registry = useContext(RegistryContext);
  // Mount atom fns so registry.set + getResult work during churn.
  useAtomSet(cancelPromptAtomFn);
  useAtomSet(deactivateSessionAtomFn);
  useAtomSet(refreshAllSessionRostersAtomFn);
  const [foldersReady, setFoldersReady] = useState(false);

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

  return (
    <>
      {foldersReady ? children : null}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>
        <ProvidersSettingsPane />
      </Box>
    </>
  );
};

export const App: FC = () => (
  <RegistryProvider>
    <AppThemeProvider>
      <CssBaseline />
      <UserSettingsMount />
      <WorkspaceFoldersGate>
        <AcpBackendsMount />
      </WorkspaceFoldersGate>
    </AppThemeProvider>
  </RegistryProvider>
);
