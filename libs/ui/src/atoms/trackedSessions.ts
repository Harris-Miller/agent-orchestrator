/**
 * Tracked sessions store, owned in one place: the persisted `tracked-sessions.json` per launch target. Hydrates the
 * records of the cwds in scope into the Backend harness snapshot, upserts every changed Session History row, and removes a
 * record only on an explicit {@link untrackSession}. The persister never deletes: Stop tracking a Project drops rows from
 * memory only, so its records stay dormant in the file until the Project is added again.
 * Every write for a launch target runs through that target's one queue, so an upsert computed before an untrack can never
 * resurrect the removed record.
 *
 * A malformed file is never overwritten (pins and Projects behave the same). Persistence has no start-guard for it: the
 * upsert fails and is logged, and the file is left as it was.
 */
import { readTrackedSessions, removeTrackedSession, trackedSessionRows, upsertTrackedSessions } from '@lib/hoa-home';
import type { TrackedSessionRecord } from '@lib/hoa-home';
import type { HostServices } from '@lib/context-services';
import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import type { HistoryEntry } from '../host/acpSessionBootstrap.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { replaceSessionHistory } from '../host/harnessStateTransitions.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';

/** A Session History row as stored: the live-only `unavailable` marker is not part of the record. */
export const trackedRecordOf = ({ unavailable: _unavailable, ...record }: HistoryEntry): TrackedSessionRecord => record;

type TargetTracked = { writes: Promise<void>; lastWritten: Map<string, string> };

const caches = new Map<AgentLaunchTarget, TargetTracked>();

const cacheOf = (launchTarget: AgentLaunchTarget): TargetTracked => {
  let cache = caches.get(launchTarget);
  if (cache === undefined) {
    cache = { lastWritten: new Map(), writes: Promise.resolve() };
    caches.set(launchTarget, cache);
  }
  return cache;
};

/**
 * Queues `work` behind every earlier write of the launch target; resolves when it has run. Never rejects: a work item that
 * throws is logged as a warning and the queue carries on.
 */
const enqueue = (launchTarget: AgentLaunchTarget, work: (cache: TargetTracked) => Promise<void>): Promise<void> => {
  const cache = cacheOf(launchTarget);
  const next = cache.writes
    .then(() => work(cache))
    .catch((cause: unknown) => {
      Effect.runFork(Effect.logWarning('tracked sessions write failed', launchTarget, cause));
    });
  cache.writes = next;
  return next;
};

/** Test/shutdown helper: resolves once every launch target's write queue has drained (including writes queued meanwhile). */
export const settleTrackedSessionWrites = async (): Promise<void> => {
  const pending = [...caches.values()].map(cache => cache.writes);
  await Promise.all(pending);
  if ([...caches.values()].some((cache, i) => cache.writes !== pending[i])) await settleTrackedSessionWrites();
};

/** Forgets what was last written for a launch target: a fresh startup hydration compares against the file again. */
export const resetTrackedSessionWrites = (launchTarget: AgentLaunchTarget): void => {
  cacheOf(launchTarget).lastWritten.clear();
};

/**
 * Merges the Tracked sessions of `cwds` into the launch target's snapshot. Rows already in the snapshot win; stored
 * records are only added. Returns whether the file was read (a malformed file or IO failure is logged, not thrown).
 */
export const hydrateTrackedSessions = (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  cwds: readonly string[],
): Effect.Effect<boolean, never, HostServices> =>
  readTrackedSessions(toLaunchTarget(launchTarget)).pipe(
    Effect.map(document => {
      const stored = trackedSessionRows(document, new Set(cwds));
      const { lastWritten } = cacheOf(launchTarget);
      for (const record of stored) lastWritten.set(record.sessionId, JSON.stringify(record));
      updateHarnessSnapshot(registry, launchTarget, current => {
        const present = new Set(current.sessionHistory.map(entry => entry.sessionId));
        return replaceSessionHistory(current, [
          ...current.sessionHistory,
          ...stored.filter(record => !present.has(record.sessionId)),
        ]);
      });
      return true;
    }),
    Effect.catchCause(cause =>
      Effect.as(Effect.logWarning('tracked sessions hydrate failed', launchTarget, cause), false),
    ),
  );

/**
 * Upserts a launch target's Session History rows whenever its snapshot changes. Writes are queued and skipped for rows
 * unchanged since they were last written; nothing is ever deleted. Returns the unsubscribe.
 */
export const startTrackedSessionsPersistence = Effect.fn('startTrackedSessionsPersistence')(function* (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
) {
  const run = Effect.runPromiseWith(yield* Effect.context<HostServices>());
  const target = toLaunchTarget(launchTarget);
  return registry.subscribe(backendHarnessSnapshotAtom(launchTarget), () => {
    enqueue(launchTarget, cache => {
      const changed = registry
        .get(backendHarnessSnapshotAtom(launchTarget))
        .sessionHistory.map(trackedRecordOf)
        .map(record => ({ json: JSON.stringify(record), record }))
        .filter(({ json, record }) => cache.lastWritten.get(record.sessionId) !== json);
      if (changed.length === 0) return Promise.resolve();
      return run(
        upsertTrackedSessions(
          target,
          changed.map(({ record }) => record),
        ).pipe(
          Effect.andThen(
            Effect.sync(() => {
              for (const { json, record } of changed) cache.lastWritten.set(record.sessionId, json);
            }),
          ),
          Effect.catchCause(cause => Effect.logWarning('tracked sessions persist failed', launchTarget, cause)),
        ),
      );
    });
  });
});

/**
 * Removes one Tracked session's record (Delete), behind any write already queued. Failures are logged, not thrown.
 */
export const untrackSession = Effect.fn('untrackSession')(function* (
  launchTarget: AgentLaunchTarget,
  cwd: string,
  sessionId: string,
) {
  const run = Effect.runPromiseWith(yield* Effect.context<HostServices>());
  yield* Effect.promise(() =>
    enqueue(launchTarget, cache =>
      run(
        removeTrackedSession(toLaunchTarget(launchTarget), cwd, sessionId).pipe(
          Effect.andThen(
            Effect.sync(() => {
              cache.lastWritten.delete(sessionId);
            }),
          ),
          Effect.catchCause(cause => Effect.logWarning('tracked session untrack failed', launchTarget, cause)),
        ),
      ),
    ),
  );
});
