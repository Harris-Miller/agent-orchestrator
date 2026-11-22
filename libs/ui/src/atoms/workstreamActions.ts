/** Workstream verbs (registry-taking, like `sessionLifecycle.ts`): each re-reads the hoa-home file, applies one change, mirrors it into state. */
import {
  addWorkstream,
  deleteWorkstream,
  makeWorkstream,
  renameWorkstream,
  setWorkstreamArchived,
} from '@lib/hoa-home';
import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { knownLaunchTarget } from '../host/agentLaunchTarget.ts';
import { sessionEntryKey } from '../host/sessionEntryKey.ts';

import { unifiedSessionHistoryAtom } from './backendState.atoms.ts';
import { archiveSessions, unarchiveSessions } from './sessionLifecycle.ts';
import { mutateWorkstreams, pendingWorkstreamAtom, workstreamsAtom } from './workstreams.atoms.ts';
import { ensureVirtual, virtualSessionAtom } from './virtualSession.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

export const createWorkstreamIn = Effect.fn('createWorkstreamIn')(function* (registry: Registry, name: string) {
  const workstream = makeWorkstream(name);
  yield* mutateWorkstreams(registry, addWorkstream(workstream));
  return workstream;
});

export const renameWorkstreamIn = (registry: Registry, id: string, name: string) =>
  mutateWorkstreams(registry, renameWorkstream(id, name));

export const deleteWorkstreamIn = (registry: Registry, id: string) => mutateWorkstreams(registry, deleteWorkstream(id));

/**
 * Archive Workstream: sets the flag, then archives every member session still in Session History. Unarchive restores all
 * members (individually archived ones included). Members missing from History are skipped.
 */
export const setWorkstreamArchivedIn = Effect.fn('setWorkstreamArchivedIn')(function* (
  registry: Registry,
  id: string,
  archived: boolean,
) {
  yield* mutateWorkstreams(registry, setWorkstreamArchived(id, archived));
  const members = registry.get(workstreamsAtom).find(ws => ws.id === id)?.sessions ?? [];
  const inHistory = new Set(registry.get(unifiedSessionHistoryAtom).map(sessionEntryKey));
  const targets = members.flatMap(member => {
    const launchTarget = knownLaunchTarget(member.launchTarget);
    return launchTarget !== undefined && inHistory.has(sessionEntryKey(member))
      ? [{ launchTarget, sessionId: member.sessionId }]
      : [];
  });
  yield* archived ? archiveSessions(registry, targets) : unarchiveSessions(registry, targets);
});

/** New session in Workstream: a Virtual session in `cwd` that joins the Workstream when it materializes. */
export const startSessionInWorkstream = Effect.fn('startSessionInWorkstream')(function* (
  registry: Registry,
  id: string,
  cwd: string,
) {
  yield* ensureVirtual(registry, { cwd, patchCwdIfSelectedVirtual: true });
  const blob = registry.get(virtualSessionAtom);
  registry.set(pendingWorkstreamAtom, blob === null ? null : { blobId: blob.id, workstreamId: id });
});
