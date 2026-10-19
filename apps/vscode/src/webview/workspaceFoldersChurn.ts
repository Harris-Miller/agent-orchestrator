import {
  ALL_AGENT_LAUNCH_TARGETS,
  applyVirtualSessionFolderChurnEffect,
  backendHarnessStateAtom,
  cancelPromptAtomFn,
  deactivateSessionAtomFn,
  refreshAllSessionRostersAtomFn,
  rwFromRegistry,
  selectedAtom,
  sessionListScopeAtom,
  sessionListScopeFromPaths,
  stripSessionPendings,
} from '@lib/ui';
import type { AgentLaunchTarget, BackendHarnessSnapshot } from '@lib/ui';
import { Effect } from 'effect';
import type { AsyncResult, Atom } from 'effect/reactivity';
import { AtomRegistry } from 'effect/reactivity';

import { firstFolderPath, sessionsMatchingSessionCwd } from './sessionsMatchingSessionCwd.ts';
import { workspaceFolderPathsAtom } from './workspaceFolderPaths.atoms.ts';

const runAtomFn = <A, E, W>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>,
  arg: W,
): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    registry.set(atom, arg);
    return yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true });
  });

const stripPendingOnMatched = (
  registry: AtomRegistry.AtomRegistry,
  matches: readonly { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string }[],
): void => {
  const byTarget = new Map<AgentLaunchTarget, string[]>();
  for (const match of matches) {
    const list = byTarget.get(match.launchTarget) ?? [];
    list.push(match.sessionId);
    byTarget.set(match.launchTarget, list);
  }
  for (const [launchTarget, sessionIds] of byTarget) {
    registry.update(backendHarnessStateAtom(launchTarget), current => stripSessionPendings(current, sessionIds));
  }
};

const clearSelectedIfMatched = (
  registry: AtomRegistry.AtomRegistry,
  matches: readonly { readonly sessionId: string }[],
): void => {
  const selected = registry.get(selectedAtom);
  if (selected?._tag === 'Session' && matches.some(match => match.sessionId === selected.sessionId)) {
    registry.set(selectedAtom, undefined);
  }
};

const anyBackendReady = (getSnapshot: (launchTarget: AgentLaunchTarget) => BackendHarnessSnapshot): boolean =>
  ALL_AGENT_LAUNCH_TARGETS.some(launchTarget => getSnapshot(launchTarget).phase === 'ready');

/** Apply folder paths + list scope (boot and non-first-path churn). */
export const applyWorkspaceFolderPaths = (registry: AtomRegistry.AtomRegistry, paths: readonly string[]): void => {
  registry.set(workspaceFolderPathsAtom, paths);
  registry.set(sessionListScopeAtom, sessionListScopeFromPaths(paths));
};

/**
 * Handle WorkspaceFoldersChanged after first Result applied.
 * Non-first path churn → paths only. First-path change → ready teardown or not-ready soft path.
 */
export const handleWorkspaceFoldersChanged = Effect.fn('handleWorkspaceFoldersChanged')(function* (
  registry: AtomRegistry.AtomRegistry,
  nextPaths: readonly string[],
) {
  const previousPaths = registry.get(workspaceFolderPathsAtom);
  const previousSessionCwd = firstFolderPath(previousPaths);
  const nextSessionCwd = firstFolderPath(nextPaths);

  if (previousSessionCwd === nextSessionCwd) {
    registry.set(workspaceFolderPathsAtom, nextPaths);
    return;
  }

  const getSnapshot = (launchTarget: AgentLaunchTarget) => registry.get(backendHarnessStateAtom(launchTarget));

  if (!anyBackendReady(getSnapshot)) {
    applyWorkspaceFolderPaths(registry, nextPaths);
    yield* applyVirtualSessionFolderChurnEffect(rwFromRegistry(registry), nextSessionCwd);
    return;
  }

  const matches = sessionsMatchingSessionCwd(lt => getSnapshot(lt), previousSessionCwd);

  for (const match of matches) {
    if (match.pendingClientRequest === 'prompt') {
      yield* runAtomFn(registry, cancelPromptAtomFn, {
        launchTarget: match.launchTarget,
        sessionId: match.sessionId,
      }).pipe(Effect.ignore);
    }
  }

  for (const match of matches) {
    yield* runAtomFn(registry, deactivateSessionAtomFn, {
      launchTarget: match.launchTarget,
      sessionId: match.sessionId,
    }).pipe(Effect.ignore);
  }

  stripPendingOnMatched(registry, matches);
  clearSelectedIfMatched(registry, matches);
  applyWorkspaceFolderPaths(registry, nextPaths);
  yield* applyVirtualSessionFolderChurnEffect(rwFromRegistry(registry), nextSessionCwd);

  yield* runAtomFn(registry, refreshAllSessionRostersAtomFn, undefined).pipe(Effect.ignore);
});
