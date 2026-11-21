import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';

import { writeJsonFile } from './harnessFiles.ts';
import type { LaunchTarget } from './LaunchTarget.ts';
import { providerFilePath } from './providers.ts';
import { emptyTrackedSessions, TrackedSessionsDocumentJsonString } from './TrackedSessionsDocument.ts';
import type { TrackedSessionRecord, TrackedSessionsDocument } from './TrackedSessionsDocument.ts';

/** `tracked-sessions.json` exists but cannot be decoded. Never treated as "no sessions", so it is never overwritten. */
export class TrackedSessionsMalformed extends Schema.TaggedError<TrackedSessionsMalformed>()(
  'TrackedSessionsMalformed',
  { message: Schema.String },
) {}

export const trackedSessionsPath = Effect.fn('trackedSessionsPath')(function* (launchTarget: LaunchTarget) {
  return yield* providerFilePath(launchTarget, 'tracked-sessions.json');
});

/** Missing file → no records; undecodable content fails with {@link TrackedSessionsMalformed}. */
export const readTrackedSessions = Effect.fn('readTrackedSessions')(function* (launchTarget: LaunchTarget) {
  const fs = yield* FileSystem;
  const filePath = yield* trackedSessionsPath(launchTarget);
  if (!(yield* fs.exists(filePath))) return emptyTrackedSessions;
  return yield* Schema.decodeEffect(TrackedSessionsDocumentJsonString)(yield* fs.readFileString(filePath)).pipe(
    Effect.mapError(error => new TrackedSessionsMalformed({ message: error.message })),
  );
});

/** Every record of the given cwds (all cwds when omitted), in file order. */
export const trackedSessionRows = (
  document: TrackedSessionsDocument,
  cwds?: ReadonlySet<string>,
): readonly TrackedSessionRecord[] =>
  Object.entries(document.cwds).flatMap(([cwd, rows]) => (cwds === undefined || cwds.has(cwd) ? rows : []));

/**
 * Re-reads the file and applies only `change`, so a stale in-memory copy never rewrites other records.
 * Fails (writing nothing) when the file is malformed.
 */
export const updateTrackedSessions = Effect.fn('updateTrackedSessions')(function* (
  launchTarget: LaunchTarget,
  change: (document: TrackedSessionsDocument) => TrackedSessionsDocument,
) {
  const next = change(yield* readTrackedSessions(launchTarget));
  yield* writeJsonFile(yield* trackedSessionsPath(launchTarget), TrackedSessionsDocumentJsonString, next);
  return next;
});

/** Per-record upsert by session id within its cwd; sibling records are left as they are. */
export const upsertTrackedSessions = (launchTarget: LaunchTarget, records: readonly TrackedSessionRecord[]) =>
  updateTrackedSessions(launchTarget, document => {
    const cwds: Record<string, readonly TrackedSessionRecord[]> = { ...document.cwds };
    for (const record of records) {
      const rows = cwds[record.cwd] ?? [];
      cwds[record.cwd] = rows.some(row => row.sessionId === record.sessionId)
        ? rows.map(row => (row.sessionId === record.sessionId ? record : row))
        : [...rows, record];
    }
    return { cwds };
  });

/** Removes one record; an emptied cwd loses its entry. */
export const removeTrackedSession = (launchTarget: LaunchTarget, cwd: string, sessionId: string) =>
  updateTrackedSessions(launchTarget, document => {
    const rows = (document.cwds[cwd] ?? []).filter(row => row.sessionId !== sessionId);
    const { [cwd]: _removed, ...rest } = document.cwds;
    return { cwds: rows.length > 0 ? { ...rest, [cwd]: rows } : rest };
  });
