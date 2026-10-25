import { RegistryContext, RegistryProvider, useAtomSet } from '@effect/atom-react';
import { onWorkspaceFoldersChanged, requestWorkspaceFolders } from '@lib/context-services-vscode-webview';
import {
  AcpBackendsMount,
  AppThemeProvider,
  cancelPromptAtomFn,
  deactivateSessionAtomFn,
  ensureVirtualSessionAtomFn,
  FdPrerequisiteGate,
  PersistUserSettingsToast,
  refreshAllSessionRostersAtomFn,
  showClientErrorToast,
  Spinner,
  Toaster,
  UserSettingsMount,
} from '@lib/ui';
import { RouterProvider } from '@tanstack/react-router';
import { Effect } from 'effect';
import type { AsyncResult, Atom } from 'effect/reactivity';
import { AtomRegistry } from 'effect/reactivity';
import { useCallback, useContext, useEffect, useState } from 'react';
import type { FC } from 'react';

import { hostIpcClient } from './bindHostRuntime.ts';
import { formatClientError, OnClientErrorContext } from './onClientError.tsx';
import { router } from './router.tsx';
import { firstFolderPath } from './sessionsMatchingSessionCwd.ts';
import { applyWorkspaceFolderPaths, handleWorkspaceFoldersChanged } from './workspaceFoldersChurn.ts';

const runAtomFn = <A, E, W>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>,
  arg: W,
): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    registry.set(atom, arg);
    return yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true });
  });

const WorkspaceFoldersGate: FC = () => {
  const registry = useContext(RegistryContext);
  useAtomSet(cancelPromptAtomFn);
  useAtomSet(deactivateSessionAtomFn);
  useAtomSet(refreshAllSessionRostersAtomFn);
  const [foldersReady, setFoldersReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let disposeChanged: (() => void) | undefined;

    Effect.runFork(
      Effect.gen(function* () {
        const paths = yield* requestWorkspaceFolders(hostIpcClient);
        applyWorkspaceFolderPaths(registry, paths);
        const bootCwd = firstFolderPath(paths);
        if (bootCwd !== undefined) {
          // AtomFn path rebinds when Ready already fired (sync ensure alone would miss Bind).
          yield* runAtomFn(registry, ensureVirtualSessionAtomFn, { cwd: bootCwd }).pipe(Effect.ignore);
        }
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

  const onClientError = useCallback((error: unknown) => {
    showClientErrorToast(formatClientError(error));
  }, []);

  if (!foldersReady) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm">
        <Spinner className="size-[18px]" />
        Loading workspace…
      </div>
    );
  }

  return (
    <OnClientErrorContext.Provider value={onClientError}>
      <AcpBackendsMount />
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <div className="h-full min-h-0 overflow-hidden">
          <RouterProvider router={router} />
        </div>
      </div>
    </OnClientErrorContext.Provider>
  );
};

export const App: FC = () => (
  <RegistryProvider>
    <AppThemeProvider>
      <UserSettingsMount />
      <PersistUserSettingsToast />
      <Toaster />
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <FdPrerequisiteGate
          onExit={() => {
            Effect.runPromise(hostIpcClient.request(id => ({ _tag: 'AppExit' as const, id }))).catch(() => undefined);
          }}
        >
          <WorkspaceFoldersGate />
        </FdPrerequisiteGate>
      </div>
    </AppThemeProvider>
  </RegistryProvider>
);
