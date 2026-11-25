import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { isUsablePhase } from '../host/acpSessionBootstrap.ts';
import { stripSessionPendings } from '../host/harnessStateTransitions.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { firstFolderPath, sessionsMatchingSessionCwd } from '../host/sessionsMatchingSessionCwd.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { sessionListScopeFromPaths } from '../host/sessionListScope.ts';
import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { deactivateSession } from './sessionLifecycle.ts';
import { hydrateTrackedSessions } from './trackedSessions.ts';
import {
  clearSelectedIfMissing,
  discardVirtual,
  editVirtual,
  ensureVirtual,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';
import { sessionHistorySearchAtom } from './sessionHistorySearch.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { isChild } from './spawnedSubagent/index.ts';
import { workspaceDirectoriesAtom, workspaceFileAtom, workspaceFolderPathsAtom } from './workspaceFolderPaths.atoms.ts';

/** The Workspace folders: file-scheme paths and, for a saved workspace, its workspace file. */
export interface WorkspaceFolders {
  readonly paths: readonly string[];
  readonly workspaceFile?: string;
}

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
    updateHarnessSnapshot(registry, launchTarget, current => stripSessionPendings(current, sessionIds));
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

/** Re-point the Virtual session at the new first folder, or drop it when there is none. */
const repointVirtual = (registry: AtomRegistry.AtomRegistry, cwd: string | undefined) =>
  cwd === undefined ? discardVirtual(registry) : ensureVirtual(registry, { cwd, patchCwdIfSelectedVirtual: true });

const anyBackendUsable = (getSnapshot: (launchTarget: AgentLaunchTarget) => BackendHarnessSnapshot): boolean =>
  MOUNTED_AGENT_LAUNCH_TARGETS.some(launchTarget => isUsablePhase(getSnapshot(launchTarget).phase));

const storeWorkspaceFolders = (
  registry: AtomRegistry.AtomRegistry,
  { paths, workspaceFile }: WorkspaceFolders,
): void => {
  registry.set(workspaceFolderPathsAtom, paths);
  registry.set(workspaceFileAtom, workspaceFile);
};

const applyWorkspaceFolders = (registry: AtomRegistry.AtomRegistry, folders: WorkspaceFolders): void => {
  storeWorkspaceFolders(registry, folders);
  const { paths } = folders;
  registry.set(sessionListScopeAtom, sessionListScopeFromPaths(paths));
};

/** Apply the initial folder paths and ensure the Virtual session for the first folder. */
export const bootWorkspaceFolders = Effect.fn('bootWorkspaceFolders')(function* (
  registry: AtomRegistry.AtomRegistry,
  folders: WorkspaceFolders,
) {
  applyWorkspaceFolders(registry, folders);
  const cwd = firstFolderPath(folders.paths);
  if (cwd !== undefined) {
    // The ensure verb rebinds when Ready already fired; a sync blob seed alone can miss Bind.
    yield* ensureVirtual(registry, { cwd }).pipe(Effect.ignore);
  }
});

/**
 * Handle a Workspace folders change after the first Result was applied.
 * - Same first folder: store the folders; Active sessions stay up. A Virtual blob on that cwd takes the new Additional
 *   directories and workspace file (a changed set tears down and rebinds its Bound session); the next create uses them.
 * - First folder changed, no ready backend: apply the folders and re-point Virtual.
 * - First folder changed, a backend ready: cancel prompts and deactivate sessions on the previous cwd,
 *   strip pendings, clear Selected, apply the folders, re-point Virtual, hydrate the new Workspace cwd's Tracked sessions.
 */
export const handleWorkspaceFoldersChanged = Effect.fn('handleWorkspaceFoldersChanged')(function* (
  registry: AtomRegistry.AtomRegistry,
  nextFolders: WorkspaceFolders,
) {
  const nextPaths = nextFolders.paths;
  const previousPaths = registry.get(workspaceFolderPathsAtom);
  const previousSessionCwd = firstFolderPath(previousPaths);
  const nextSessionCwd = firstFolderPath(nextPaths);

  if (previousSessionCwd === nextSessionCwd) {
    storeWorkspaceFolders(registry, nextFolders);
    const virtual = registry.get(virtualSessionAtom);
    if (nextSessionCwd !== undefined && virtual?.cwd === nextSessionCwd) {
      const { additionalDirectories, workspaceFile } = registry.get(workspaceDirectoriesAtom);
      yield* editVirtual(registry, { additionalDirectories: additionalDirectories ?? [], workspaceFile });
    }
    return;
  }

  registry.set(sessionHistorySearchAtom, { scope: nextSessionCwd, query: '' });
  applyWorkspaceFolders(registry, nextFolders);

  const getSnapshot = (launchTarget: AgentLaunchTarget) => registry.get(backendHarnessSnapshotAtom(launchTarget));
  if (!anyBackendUsable(getSnapshot)) {
    yield* repointVirtual(registry, nextSessionCwd);
    return;
  }

  const matches = sessionsMatchingSessionCwd(getSnapshot, previousSessionCwd, (launchTarget, sessionId) =>
    isChild(registry, { launchTarget, sessionId }),
  );
  for (const match of matches) {
    yield* deactivateSession(registry, { launchTarget: match.launchTarget, sessionId: match.sessionId }).pipe(
      Effect.ignore,
    );
  }

  stripPendingOnMatched(registry, matches);
  clearSelectedIfMatched(registry, matches);
  yield* repointVirtual(registry, nextSessionCwd);
  if (nextSessionCwd !== undefined) {
    yield* Effect.forEach(
      MOUNTED_AGENT_LAUNCH_TARGETS,
      launchTarget => hydrateTrackedSessions(registry, launchTarget, [nextSessionCwd]),
      { discard: true },
    );
  }
  clearSelectedIfMissing(registry);
});
