import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { stripSessionPendings } from '../host/harnessStateTransitions.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { sessionsMatchingSessionCwd } from '../host/sessionsMatchingSessionCwd.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { sessionListScopeFromPaths } from '../host/sessionListScope.ts';
import { backendHarnessStateAtom, selectedAtom } from './backendState.atoms.ts';
import {
  cancelPromptAtomFn,
  deactivateSessionAtomFn,
  ensureVirtualSessionAtomFn,
  refreshAllSessionRostersAtomFn,
} from './boundHarnessAtoms.ts';
import { runAtomFn, rwFromRegistry } from './virtualBind.ts';
import { applyVirtualSessionFolderChurnEffect } from './virtualSession.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { workspaceFolderPathsAtom } from './workspaceFolderPaths.atoms.ts';

const firstFolderPath = (paths: readonly string[]): string | undefined => paths[0];

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
  MOUNTED_AGENT_LAUNCH_TARGETS.some(launchTarget => getSnapshot(launchTarget).phase === 'ready');

const applyWorkspaceFolderPaths = (registry: AtomRegistry.AtomRegistry, paths: readonly string[]): void => {
  registry.set(workspaceFolderPathsAtom, paths);
  registry.set(sessionListScopeAtom, sessionListScopeFromPaths(paths));
};

export const bootWorkspaceFolders = Effect.fn('bootWorkspaceFolders')(function* (
  registry: AtomRegistry.AtomRegistry,
  paths: readonly string[],
) {
  applyWorkspaceFolderPaths(registry, paths);
  const cwd = firstFolderPath(paths);
  if (cwd !== undefined) {
    // AtomFn path rebinds when Ready already fired; sync ensure alone can miss Bind.
    yield* runAtomFn(registry, ensureVirtualSessionAtomFn, { cwd }).pipe(Effect.ignore);
  }
});

export const workspaceFoldersChanged = Effect.fn('workspaceFoldersChanged')(function* (
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

  const matches = sessionsMatchingSessionCwd(getSnapshot, previousSessionCwd);
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
