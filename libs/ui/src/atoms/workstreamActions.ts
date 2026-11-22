/** Workstream verbs (registry-taking, like `sessionLifecycle.ts`): each re-reads the hoa-home file, applies one change, mirrors it into state. */
import {
  adoptSession,
  createWorkstream,
  deleteWorkstream,
  orphanSession,
  readWorkstreams,
  setWorkstreamArchived,
  updateWorkstream,
  WorkstreamsMalformed,
} from '@lib/hoa-home';
import type { TrackerRef, WorkstreamSession } from '@lib/hoa-home';
import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { knownLaunchTarget } from '../host/agentLaunchTarget.ts';

import { unifiedSessionHistoryAtom } from './backendState.atoms.ts';
import { archiveSessions, unarchiveSessions } from './sessionLifecycle.ts';
import { pendingWorkstreamAtom, workstreamsAtom, workstreamsLoadedAtom } from './workstreams.atoms.ts';
import { ensureVirtual, virtualSessionAtom } from './virtualSession.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

/** Runs one file change, then mirrors the file into state. Fails (writing nothing) until the file was read, so a malformed file is never overwritten. */
const mutate = <A, E, R>(registry: Registry, change: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    if (!registry.get(workstreamsLoadedAtom)) {
      return yield* new WorkstreamsMalformed({
        message: 'Workstreams file could not be read; fix or remove workstreams.json to change Workstreams.',
      });
    }
    const result = yield* change;
    registry.set(workstreamsAtom, (yield* readWorkstreams()).workstreams);
    return result;
  });

export const createWorkstreamIn = (registry: Registry, name: string, trackers: readonly TrackerRef[]) =>
  mutate(registry, createWorkstream(name, trackers));

export const updateWorkstreamIn = (
  registry: Registry,
  id: string,
  patch: { readonly name?: string; readonly trackers?: readonly TrackerRef[] },
) => mutate(registry, updateWorkstream(id, patch));

export const deleteWorkstreamIn = (registry: Registry, id: string) => mutate(registry, deleteWorkstream(id));

export const adoptIntoWorkstream = (registry: Registry, id: string, session: WorkstreamSession) =>
  mutate(registry, adoptSession(id, session));

export const orphanFromWorkstream = (registry: Registry, session: WorkstreamSession) =>
  mutate(registry, orphanSession(session));

/**
 * Archive Workstream: sets the flag, then archives every member session still in Session History. Unarchive restores all
 * members (individually archived ones included). Members missing from History are skipped.
 */
export const setWorkstreamArchivedIn = Effect.fn('setWorkstreamArchivedIn')(function* (
  registry: Registry,
  id: string,
  archived: boolean,
) {
  yield* mutate(registry, setWorkstreamArchived(id, archived));
  const members = registry.get(workstreamsAtom).find(ws => ws.id === id)?.sessions ?? [];
  const inHistory = new Set(
    registry.get(unifiedSessionHistoryAtom).map(entry => `${entry.launchTarget}:${entry.sessionId}`),
  );
  const targets = members.flatMap(member => {
    const launchTarget = knownLaunchTarget(member.launchTarget);
    return launchTarget !== undefined && inHistory.has(`${member.launchTarget}:${member.sessionId}`)
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
