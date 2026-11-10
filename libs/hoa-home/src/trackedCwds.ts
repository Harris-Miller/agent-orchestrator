import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { writeJsonFile } from './harnessFiles.ts';
import { resolveHome } from './home.ts';
import { emptyTrackedCwds, TrackedCwdsDocumentJsonString } from './TrackedCwdsDocument.ts';
import type { TrackedCwdsDocument } from './TrackedCwdsDocument.ts';

/** `tracked-cwds.json` exists but cannot be decoded. Never treated as "no cwds", so it is never overwritten. */
export class TrackedCwdsMalformed extends Schema.TaggedError<TrackedCwdsMalformed>()('TrackedCwdsMalformed', {
  message: Schema.String,
}) {}

export const trackedCwdsPath = Effect.fn('trackedCwdsPath')(function* () {
  const path = yield* Path;
  return path.join(yield* resolveHome(), 'tracked-cwds.json');
});

/** Missing file → no cwds; undecodable content fails with {@link TrackedCwdsMalformed}. */
export const readTrackedCwds = Effect.fn('readTrackedCwds')(function* () {
  const fs = yield* FileSystem;
  const filePath = yield* trackedCwdsPath();
  if (!(yield* fs.exists(filePath))) return emptyTrackedCwds;
  return yield* Schema.decodeEffect(TrackedCwdsDocumentJsonString)(yield* fs.readFileString(filePath)).pipe(
    Effect.mapError(error => new TrackedCwdsMalformed({ message: error.message })),
  );
});

/**
 * Re-reads the file and applies only `change`, so a stale in-memory copy never rewrites other cwds.
 * Fails (writing nothing) when the file is malformed. Returns the document written.
 */
export const updateTrackedCwds = Effect.fn('updateTrackedCwds')(function* (
  change: (cwds: readonly string[]) => readonly string[],
) {
  const current = yield* readTrackedCwds();
  const next: TrackedCwdsDocument = { cwds: change(current.cwds) };
  yield* writeJsonFile(yield* trackedCwdsPath(), TrackedCwdsDocumentJsonString, next);
  return next;
});

/** Adds the cwds not yet tracked, in the given order. */
export const trackCwds = (cwds: readonly string[]) =>
  updateTrackedCwds(tracked => [...tracked, ...new Set(cwds.filter(cwd => !tracked.includes(cwd)))]);

export const untrackCwd = (cwd: string) => updateTrackedCwds(tracked => tracked.filter(item => item !== cwd));
