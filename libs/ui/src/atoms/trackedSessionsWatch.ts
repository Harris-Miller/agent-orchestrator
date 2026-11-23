/**
 * Watches the tracked-sessions file for changes made by other app instances (desktop, VS Code): polls its `stat`
 * signature and reconciles Session History rows with it (add, update, archive flag, remove) without touching Agent state.
 * See `trackedSessions.ts` for `lastWritten`, and ADR 0011.
 */
import { readTrackedSessions, trackedSessionRows, trackedSessionsPath } from '@lib/hoa-home';
import type { HostServices } from '@lib/context-services';
import { Duration, Effect, FileSystem, Option, Schedule } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import type { HistoryEntry } from '../host/acpSessionBootstrap.ts';
import { decodeHistoryEntry } from '../host/historyEntry.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { dropSession, replaceSessionHistory } from '../host/harnessStateTransitions.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { listedCwdsAtom } from './listedCwds.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { updateAndClearSelection } from './sessionLifecycle.ts';
import { enqueue, fingerprint } from './trackedSessions.ts';

/** Poll period for the file signature: neither Host can `FileSystem.watch`, but both can `stat`. */
export const TRACKED_SESSIONS_POLL_MS = 1000;

export type ExternalChanges = {
  /** Rows to add or replace in place (decoded), in file order. */
  readonly upserts: readonly HistoryEntry[];
  /** Session ids to drop (Deleted elsewhere). */
  readonly removals: readonly string[];
  /** File rows now known to be in the file and equal to memory; recorded in `lastWritten` so a later Delete is seen. */
  readonly synced: readonly HistoryEntry[];
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
  const upserts: HistoryEntry[] = [];
  const synced: HistoryEntry[] = [];
  for (const row of fileRows) {
    const json = fingerprint(row);
    const known = lastWritten.get(row.sessionId);
    const existing = inMemory.get(row.sessionId);
    if (known === json) {
      // Equal to what we know is in the file: no external change.
    } else if (existing === undefined) {
      if (known === undefined) upserts.push(row);
    } else if (fingerprint(existing) !== json) {
      upserts.push(row);
    } else {
      synced.push(row);
    }
  }
  const inFile = new Set(fileRows.map(row => row.sessionId));
  const removals = memory
    .filter(row => scope.has(row.cwd) && lastWritten.has(row.sessionId) && !inFile.has(row.sessionId))
    .map(row => row.sessionId);
  return { removals, synced, upserts };
};

/**
 * Reads the file once and applies what other instances changed to Session History, behind queued writes. Never calls the
 * Agent. Resolves whether the file's state was settled (applied, or malformed and logged): `false` when the file was
 * missing or unreadable, so the caller retries. A missing file is "no change", never an empty document to reconcile with.
 */
export const applyExternalTrackedSessions = Effect.fn('applyExternalTrackedSessions')(function* (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
  cwds: readonly string[],
) {
  const context = yield* Effect.context<HostServices>();
  const run = Effect.runPromiseWith(context);
  const scope = new Set(cwds);
  let settled = false;
  yield* Effect.promise(() =>
    enqueue(launchTarget, cache =>
      run(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const target = toLaunchTarget(launchTarget);
          // `readTrackedSessions` reads a missing file as empty; here that would look like "everything Deleted".
          if (!(yield* fs.exists(yield* trackedSessionsPath(target)))) return;
          const document = yield* readTrackedSessions(target);
          const fileRows = trackedSessionRows(document, scope).map(decodeHistoryEntry);
          const memory = registry.get(backendHarnessSnapshotAtom(launchTarget)).sessionHistory;
          const { removals, synced, upserts } = reconcileExternalTracked(fileRows, memory, cache.lastWritten, scope);
          // Mark as known first, so the persister (subscribed to the snapshot) sees nothing to write back.
          for (const row of [...synced, ...upserts]) cache.lastWritten.set(row.sessionId, fingerprint(row));
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
          settled = true;
        }).pipe(
          // A malformed file stays malformed until someone rewrites it: settled, so the poll does not re-log each tick.
          Effect.catchTag('TrackedSessionsMalformed', cause =>
            Effect.logWarning('tracked sessions file malformed', launchTarget, cause).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  settled = true;
                }),
              ),
            ),
          ),
          Effect.catchCause(cause => Effect.logWarning('tracked sessions external sync failed', launchTarget, cause)),
        ),
      ),
    ),
  );
  return settled;
});

/** The file's `mtime:size` signature; a failed `stat` is `None` ("no change"). */
const signatureOf = (info: FileSystem.File.Info): string =>
  `${String(
    Option.getOrElse(
      Option.map(info.mtime, date => date.getTime()),
      () => 0,
    ),
  )}:${String(info.size)}`;

/**
 * Polls the launch target's file signature (`mtime:size`) and applies external changes when it moves. A missing file or
 * failed `stat` is "no change"; a signature is remembered only once its content was settled, so an IO failure retries.
 * Returns the unsubscribe, which interrupts the poll.
 */
export const startTrackedSessionsWatch = Effect.fn('startTrackedSessionsWatch')(function* (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
) {
  const fs = yield* FileSystem.FileSystem;
  const filePath = yield* trackedSessionsPath(toLaunchTarget(launchTarget));
  let seen: string | undefined;
  const poll = Effect.gen(function* () {
    const info = yield* Effect.option(fs.stat(filePath));
    if (Option.isNone(info)) return;
    const signature = signatureOf(info.value);
    if (signature === seen) return;
    if (yield* applyExternalTrackedSessions(registry, launchTarget, registry.get(listedCwdsAtom))) seen = signature;
  }).pipe(Effect.catchCause(cause => Effect.logWarning('tracked sessions poll failed', launchTarget, cause)));
  // Forked from this fiber so it inherits the clock; detached so it outlives the hydrating fiber.
  const fiber = yield* Effect.forkDetach(
    poll.pipe(Effect.repeat(Schedule.spaced(Duration.millis(TRACKED_SESSIONS_POLL_MS)))),
  );
  return () => {
    fiber.interruptUnsafe();
  };
});
