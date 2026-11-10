import { Effect, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';

import { emptyPinnedSessions, PinnedSessionsDocumentJsonString } from './PinnedSessionsDocument.ts';
import type { PinnedSession, PinnedSessionsDocument } from './PinnedSessionsDocument.ts';
import { writeJsonFile } from './harnessFiles.ts';
import type { LaunchTarget } from './LaunchTarget.ts';
import { providerFilePath } from './providers.ts';

/** `pinned-sessions.json` exists but cannot be decoded. Never treated as "no pins", so it is never overwritten. */
export class PinnedSessionsMalformed extends Schema.TaggedError<PinnedSessionsMalformed>()('PinnedSessionsMalformed', {
  message: Schema.String,
}) {}

export const pinnedSessionsPath = Effect.fn('pinnedSessionsPath')(function* (launchTarget: LaunchTarget) {
  return yield* providerFilePath(launchTarget, 'pinned-sessions.json');
});

/** Missing file → no pins; undecodable content fails with {@link PinnedSessionsMalformed}. */
export const readPinnedSessions = Effect.fn('readPinnedSessions')(function* (launchTarget: LaunchTarget) {
  const fs = yield* FileSystem;
  const filePath = yield* pinnedSessionsPath(launchTarget);
  if (!(yield* fs.exists(filePath))) return emptyPinnedSessions;
  return yield* Schema.decodeEffect(PinnedSessionsDocumentJsonString)(yield* fs.readFileString(filePath)).pipe(
    Effect.mapError(error => new PinnedSessionsMalformed({ message: error.message })),
  );
});

/**
 * Re-reads the file and applies only `change`, so a stale in-memory copy never rewrites other pins.
 * Fails (writing nothing) when the file is malformed. Returns the document written.
 */
export const updatePinnedSessions = Effect.fn('updatePinnedSessions')(function* (
  launchTarget: LaunchTarget,
  change: (pinned: readonly PinnedSession[]) => readonly PinnedSession[],
) {
  const current = yield* readPinnedSessions(launchTarget);
  const next: PinnedSessionsDocument = { pinned: change(current.pinned) };
  yield* writeJsonFile(yield* pinnedSessionsPath(launchTarget), PinnedSessionsDocumentJsonString, next);
  return next;
});

export const pinSession = (launchTarget: LaunchTarget, entry: PinnedSession) =>
  updatePinnedSessions(launchTarget, pinned =>
    pinned.some(item => item.sessionId === entry.sessionId) ? pinned : [...pinned, entry],
  );

export const unpinSessions = (launchTarget: LaunchTarget, sessionIds: readonly string[]) =>
  updatePinnedSessions(launchTarget, pinned => pinned.filter(item => !sessionIds.includes(item.sessionId)));
