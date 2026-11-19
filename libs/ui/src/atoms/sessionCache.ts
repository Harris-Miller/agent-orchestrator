/**
 * Session cache: the persisted session index (`session-index.json` per launch target), owned in one place. Hydrates
 * cached rows into the Backend harness snapshot, persists listed cwds' rows and pins, and drops a cwd on Stop tracking.
 * Every write for a launch target (persist or remove) runs through that target's one queue, so a persist computed before
 * Stop tracking can never resurrect the removed cwd.
 *
 * The index is a rebuildable cache: an undecodable file reads empty and the next write overwrites it. Projects and pins
 * keep their never-overwrite-malformed policy.
 */
import { readSessionIndex, removeSessionIndexCwds, sessionIndexRows, updateSessionIndex } from '@lib/hoa-home';
import type { SessionIndexEntry } from '@lib/hoa-home';
import type { HostServices } from '@lib/context-services';
import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import type { HistoryEntry } from '../host/acpSessionBootstrap.ts';
import { MOUNTED_AGENT_LAUNCH_TARGETS, toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { markHistoryUnavailable, replaceSessionHistory } from '../host/harnessStateTransitions.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { pinnedSessionsAtom } from './pinnedSessions.atoms.ts';
import { listKey, sessionListStatesAtom } from './sessionLists.atoms.ts';

/** Rows of Session History grouped under each listed cwd (every listed cwd gets a key, so an emptied one is cleared). */
export const indexRowsByCwd = (
  history: readonly HistoryEntry[],
  listedCwds: readonly string[],
): Record<string, readonly SessionIndexEntry[]> => {
  const byCwd: Record<string, SessionIndexEntry[]> = Object.fromEntries(listedCwds.map(cwd => [cwd, []]));
  for (const { unavailable: _unavailable, ...entry } of history) {
    byCwd[entry.cwd]?.push(entry);
  }
  return byCwd;
};

type TargetCache = { writes: Promise<void>; lastWritten: string };

const caches = new Map<AgentLaunchTarget, TargetCache>();

const cacheOf = (launchTarget: AgentLaunchTarget): TargetCache => {
  let cache = caches.get(launchTarget);
  if (cache === undefined) {
    cache = { lastWritten: '', writes: Promise.resolve() };
    caches.set(launchTarget, cache);
  }
  return cache;
};

/**
 * Queues `work` behind every earlier write of the launch target; resolves when it has run. Never rejects: a work item that
 * throws is logged as a warning and the queue carries on.
 */
const enqueue = (launchTarget: AgentLaunchTarget, work: (cache: TargetCache) => Promise<void>): Promise<void> => {
  const cache = cacheOf(launchTarget);
  const next = cache.writes
    .then(() => work(cache))
    .catch((cause: unknown) => {
      Effect.runFork(Effect.logWarning('session cache write failed', launchTarget, cause));
    });
  cache.writes = next;
  return next;
};

/** Test/shutdown helper: resolves once every launch target's write queue has drained (including writes queued meanwhile). */
export const settleSessionCacheWrites = async (): Promise<void> => {
  const pending = [...caches.values()].map(cache => cache.writes);
  await Promise.all(pending);
  if ([...caches.values()].some((cache, i) => cache.writes !== pending[i])) await settleSessionCacheWrites();
};

/**
 * Merges the cached rows of `cwds` into the launch target's snapshot as unavailable rows. Rows already in the snapshot
 * win; cached rows are only added. Returns whether the file was read (an IO failure is logged, not thrown).
 */
export const hydrateSessionCache = (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  cwds: readonly string[],
): Effect.Effect<boolean, never, HostServices> =>
  readSessionIndex(toLaunchTarget(launchTarget)).pipe(
    Effect.map(document => {
      const cached = markHistoryUnavailable(sessionIndexRows(document, new Set(cwds)));
      updateHarnessSnapshot(registry, launchTarget, current => {
        const present = new Set(current.sessionHistory.map(entry => entry.sessionId));
        return replaceSessionHistory(current, [
          ...current.sessionHistory,
          ...cached.filter(entry => !present.has(entry.sessionId)),
        ]);
      });
      return true;
    }),
    Effect.catchCause(cause =>
      Effect.as(Effect.logWarning('session index hydrate failed', launchTarget, cause), false),
    ),
  );

/**
 * Persists a launch target's Session History rows (for `listedCwds()` only) and pins whenever its snapshot changes.
 * Writes are queued and skipped when unchanged; cwds this host does not list are never rewritten. Returns the unsubscribe.
 */
export const startSessionCachePersistence = Effect.fn('startSessionCachePersistence')(function* (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  listedCwds: () => readonly string[],
) {
  const run = Effect.runPromiseWith(yield* Effect.context<HostServices>());
  const target = toLaunchTarget(launchTarget);
  cacheOf(launchTarget).lastWritten = '';
  return registry.subscribe(backendHarnessSnapshotAtom(launchTarget), () => {
    enqueue(launchTarget, cache => {
      const current = registry.get(backendHarnessSnapshotAtom(launchTarget));
      // A listed cwd with no rows and no complete list yet keeps its cached entry (it may hold rows not hydrated yet).
      const states = registry.get(sessionListStatesAtom);
      const writable = listedCwds().filter(
        cwd =>
          states.get(listKey(launchTarget, cwd)) === 'complete' || current.sessionHistory.some(row => row.cwd === cwd),
      );
      const rowsByCwd = indexRowsByCwd(current.sessionHistory, writable);
      const pinnedIds = new Set(registry.get(pinnedSessionsAtom(launchTarget)).map(pin => pin.sessionId));
      const nextJson = JSON.stringify([rowsByCwd, [...pinnedIds]]);
      if (nextJson === cache.lastWritten) return Promise.resolve();
      return run(
        updateSessionIndex(target, rowsByCwd, pinnedIds).pipe(
          Effect.andThen(
            Effect.sync(() => {
              cache.lastWritten = nextJson;
            }),
          ),
          Effect.catchCause(cause => Effect.logWarning('session index persist failed', launchTarget, cause)),
        ),
      );
    });
  });
});

/**
 * Drops `cwd` from every mounted launch target's index (Stop tracking), behind any write already queued, and forgets
 * what was last written so re-adding the Project rewrites its entry. Failures are logged, not thrown.
 */
export const removeSessionCacheCwd = Effect.fn('removeSessionCacheCwd')(function* (cwd: string) {
  const run = Effect.runPromiseWith(yield* Effect.context<HostServices>());
  yield* Effect.promise(() =>
    Promise.all(
      MOUNTED_AGENT_LAUNCH_TARGETS.map(launchTarget =>
        enqueue(launchTarget, cache =>
          run(
            removeSessionIndexCwds(toLaunchTarget(launchTarget), [cwd]).pipe(
              Effect.catchCause(cause => Effect.logWarning('session index cleanup failed', launchTarget, cause)),
              Effect.andThen(
                Effect.sync(() => {
                  cache.lastWritten = '';
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );
});
