/**
 * Tracked sessions store, owned in one place: the persisted `tracked-sessions.json` per launch target. Hydrates the
 * records of the cwds in scope into the Backend harness snapshot, upserts every changed Session History row, and removes a
 * record only on an explicit {@link untrackSession}. The persister never deletes: Stop tracking a Project drops rows from
 * memory only, so its records stay dormant in the file until the Project is added again.
 * Every write for a launch target runs through that target's one queue, so an upsert computed before an untrack can never
 * resurrect the removed record.
 *
 * Other app instances (desktop, VS Code) share the file, so {@link startTrackedSessionsWatch} polls its `stat` signature and
 * {@link applyExternalTrackedSessions} reconciles Session History rows with it (add, update, archive flag, remove) without
 * touching Agent state. `lastWritten` is "what we know is in the file": it tells an external Delete (known, now absent)
 * from a pending local create (unknown) and keeps our own writes from echoing.
 *
 * A malformed file is never overwritten (pins and Projects behave the same). Persistence has no start-guard for it: the
 * upsert fails and is logged, and the file is left as it was.
 */
import {
  readTrackedSessions,
  removeTrackedSession,
  trackedSessionRows,
  trackedSessionsPath,
  upsertTrackedSessions,
} from '@lib/hoa-home';
import type { TrackedSessionRecord } from '@lib/hoa-home';
import type { HostServices } from '@lib/context-services';
import { Duration, Effect, FileSystem, Option, Schedule } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import type { HistoryEntry } from '../host/acpSessionBootstrap.ts';
import { decodeHistoryEntry, encodeHistoryEntry } from '../host/historyEntry.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { dropSession, replaceSessionHistory } from '../host/harnessStateTransitions.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { listedCwdsAtom } from './listedCwds.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { updateAndClearSelection } from './sessionLifecycle.ts';

/** A Session History row as stored: encoded (`historyEntry.ts`), without the live-only `unavailable` marker. */
export const trackedRecordOf = ({ unavailable: _unavailable, ...row }: HistoryEntry): TrackedSessionRecord =>
  encodeHistoryEntry(row);

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
      const stored = trackedSessionRows(document, new Set(cwds)).map(decodeHistoryEntry);
      const { lastWritten } = cacheOf(launchTarget);
      // Compared against what the persister would write for the row, so a row unchanged since hydrate is not rewritten.
      for (const row of stored) lastWritten.set(row.sessionId, JSON.stringify(trackedRecordOf(row)));
      updateHarnessSnapshot(registry, launchTarget, current => {
        const present = new Set(current.sessionHistory.map(entry => entry.sessionId));
        return replaceSessionHistory(current, [
          ...current.sessionHistory,
          ...stored.filter(row => !present.has(row.sessionId)),
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

/** Poll period for the file signature: neither Host can `FileSystem.watch`, but both can `stat`. */
export const TRACKED_SESSIONS_POLL_MS = 1000;

export type ExternalChanges = {
  /** Rows to add or replace in place (decoded), in file order. */
  readonly upserts: readonly HistoryEntry[];
  /** Session ids to drop (Deleted elsewhere). */
  readonly removals: readonly string[];
};

/**
 * Pure reconcile of the file's in-scope rows with Session History. See ADR 0011. A file row equal to `lastWritten` is no
 * external change (protects a pending local edit from a stale file); a memory row known to `lastWritten` but absent from
 * the file was Deleted elsewhere; unknown memory rows are pending local creates and stay.
 */
export const reconcileExternalTracked = (
  fileRows: readonly HistoryEntry[],
  memory: readonly HistoryEntry[],
  lastWritten: ReadonlyMap<string, string>,
  scope: ReadonlySet<string>,
): ExternalChanges => {
  const inMemory = new Map(memory.map(row => [row.sessionId, row]));
  const upserts = fileRows.filter(row => {
    const json = JSON.stringify(trackedRecordOf(row));
    const known = lastWritten.get(row.sessionId);
    if (known === json) return false;
    const existing = inMemory.get(row.sessionId);
    if (existing === undefined) return known === undefined;
    return JSON.stringify(trackedRecordOf(existing)) !== json;
  });
  const inFile = new Set(fileRows.map(row => row.sessionId));
  const removals = memory
    .filter(row => scope.has(row.cwd) && lastWritten.has(row.sessionId) && !inFile.has(row.sessionId))
    .map(row => row.sessionId);
  return { removals, upserts };
};

/**
 * Reads the file once and applies what other instances changed to Session History, behind queued writes. Never calls the
 * Agent. A malformed file or IO failure is logged and leaves the rows as they are.
 */
export const applyExternalTrackedSessions = Effect.fn('applyExternalTrackedSessions')(function* (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  cwds: readonly string[],
) {
  const context = yield* Effect.context<HostServices>();
  const run = Effect.runPromiseWith(context);
  const scope = new Set(cwds);
  yield* Effect.promise(() =>
    enqueue(launchTarget, cache =>
      run(
        Effect.gen(function* () {
          const document = yield* readTrackedSessions(toLaunchTarget(launchTarget));
          const fileRows = trackedSessionRows(document, scope).map(decodeHistoryEntry);
          const memory = registry.get(backendHarnessSnapshotAtom(launchTarget)).sessionHistory;
          const { removals, upserts } = reconcileExternalTracked(fileRows, memory, cache.lastWritten, scope);
          // Mark as known first, so the persister (subscribed to the snapshot) sees nothing to write back.
          for (const row of upserts) cache.lastWritten.set(row.sessionId, JSON.stringify(trackedRecordOf(row)));
          for (const id of removals) cache.lastWritten.delete(id);
          if (upserts.length > 0) {
            updateHarnessSnapshot(registry, launchTarget, current => {
              const incoming = new Map(upserts.map(row => [row.sessionId, row]));
              const present = new Set(current.sessionHistory.map(row => row.sessionId));
              return replaceSessionHistory(current, [
                ...current.sessionHistory.map(row => {
                  const next = incoming.get(row.sessionId);
                  return next === undefined ? row : { ...next, unavailable: row.unavailable };
                }),
                ...upserts.filter(row => !present.has(row.sessionId)),
              ]);
            });
          }
          for (const id of removals) {
            yield* updateAndClearSelection(registry, launchTarget, id, current => dropSession(current, id));
          }
        }).pipe(
          Effect.catchCause(cause => Effect.logWarning('tracked sessions external sync failed', launchTarget, cause)),
        ),
      ),
    ),
  );
});

/**
 * Polls the launch target's file signature (`mtime:size`) and applies external changes when it moves. A missing file or
 * failed `stat` is "no change". Returns the unsubscribe, which interrupts the poll.
 */
export const startTrackedSessionsWatch = Effect.fn('startTrackedSessionsWatch')(function* (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
) {
  const fs = yield* FileSystem.FileSystem;
  const filePath = yield* trackedSessionsPath(toLaunchTarget(launchTarget));
  let seen: string | undefined;
  const poll = fs.stat(filePath).pipe(
    Effect.map(
      info =>
        `${String(
          Option.getOrElse(
            Option.map(info.mtime, date => date.getTime()),
            () => 0,
          ),
        )}:${String(info.size)}`,
    ),
    Effect.option,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: signature =>
          signature === seen
            ? Effect.void
            : Effect.suspend(() => {
                seen = signature;
                return applyExternalTrackedSessions(registry, launchTarget, registry.get(listedCwdsAtom));
              }),
      }),
    ),
    Effect.catchCause(cause => Effect.logWarning('tracked sessions poll failed', launchTarget, cause)),
  );
  // Forked from this fiber so it inherits the clock; detached so it outlives the hydrating fiber.
  const fiber = yield* Effect.forkDetach(
    poll.pipe(Effect.repeat(Schedule.spaced(Duration.millis(TRACKED_SESSIONS_POLL_MS)))),
  );
  return () => {
    fiber.interruptUnsafe();
  };
});
