import { RegistryContext, RegistryProvider, useAtomSet, useAtomValue } from '@effect/atom-react';
import { onWorkspaceFoldersChanged, requestWorkspaceFolders } from '@lib/context-services-vscode-webview';
import {
  AcpBackendsMount,
  AppThemeProvider,
  cancelPromptAtomFn,
  deactivateSessionAtomFn,
  ProvidersSettingsPane,
  refreshAllSessionRostersAtomFn,
  sessionListScopeAtom,
  UserSettingsMount,
} from '@lib/ui';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import Typography from '@mui/material/Typography';
import { Effect } from 'effect';
import { useContext, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { hostIpcClient } from './bindHostRuntime.ts';
import { sessionCwdAtom, workspaceFolderPathsAtom } from './workspaceFolderPaths.atoms.ts';
import { applyWorkspaceFolderPaths, handleWorkspaceFoldersChanged } from './workspaceFoldersChurn.ts';

/** TEMP debug — remove when #90 UI lands. */
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
        <WorkspaceCwdDebug />
      </WorkspaceFoldersGate>
    </AppThemeProvider>
  </RegistryProvider>
);
