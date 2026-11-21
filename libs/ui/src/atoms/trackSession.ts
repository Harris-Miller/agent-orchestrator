/** Tracking a session: the row joins Session History (the persister writes its Tracked session record) and VS Code's Workspace cwd becomes a Project. */
import { addProject } from '@lib/hoa-home';
import type { HostServices } from '@lib/context-services';
import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import type { NormalizedSessionInfo } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { upsertIntoSnapshot } from '../host/harnessStateTransitions.ts';

import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';

/**
 * VS Code (Cwd scope): the first Tracked session under the Workspace cwd makes it a Project, if it is not one already.
 * Desktop already requires a Project. A failure (e.g. a malformed Projects file) is logged and never blocks tracking.
 */
export const ensureWorkspaceProject = (
  registry: AtomRegistry.AtomRegistry,
  cwd: string,
): Effect.Effect<void, never, HostServices> => {
  const scope = registry.get(sessionListScopeAtom);
  if (scope._tag !== 'Cwd' || scope.cwd !== cwd) return Effect.void;
  return addProject(cwd).pipe(
    Effect.asVoid,
    Effect.catchCause(cause => Effect.logWarning('workspace Project add failed', cause)),
  );
};

/** Tracks a created or imported session: upserts its row, then applies {@link ensureWorkspaceProject}. */
export const trackSession = Effect.fn('trackSession')(function* (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  historyEntry: NormalizedSessionInfo,
) {
  updateHarnessSnapshot(registry, launchTarget, current => upsertIntoSnapshot(current, { historyEntry }));
  yield* ensureWorkspaceProject(registry, historyEntry.cwd);
});
