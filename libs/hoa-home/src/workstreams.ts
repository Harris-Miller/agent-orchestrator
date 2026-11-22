import { Effect, Schema, Semaphore } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { writeJsonFile } from './harnessFiles.ts';
import { resolveHome } from './home.ts';
import { emptyWorkstreams, WorkstreamsDocumentJsonString } from './WorkstreamsDocument.ts';
import type { TrackerRef, Workstream, WorkstreamsDocument, WorkstreamSession } from './WorkstreamsDocument.ts';

/** `workstreams.json` exists but cannot be decoded. Never treated as "no Workstreams", so it is never overwritten. */
export class WorkstreamsMalformed extends Schema.TaggedError<WorkstreamsMalformed>()('WorkstreamsMalformed', {
  message: Schema.String,
}) {}

export const workstreamsPath = Effect.fn('workstreamsPath')(function* () {
  const path = yield* Path;
  return path.join(yield* resolveHome(), 'workstreams.json');
});

/** Missing file → no Workstreams; undecodable content fails with {@link WorkstreamsMalformed}. */
export const readWorkstreams = Effect.fn('readWorkstreams')(function* () {
  const fs = yield* FileSystem;
  const filePath = yield* workstreamsPath();
  if (!(yield* fs.exists(filePath))) return emptyWorkstreams;
  return yield* Schema.decodeEffect(WorkstreamsDocumentJsonString)(yield* fs.readFileString(filePath)).pipe(
    Effect.mapError(error => new WorkstreamsMalformed({ message: error.message })),
  );
});

/** One writer at a time in this process, so concurrent read-modify-writes never lose each other's change. */
const writeLock = Semaphore.makeUnsafe(1);

/**
 * Re-reads the file and applies only `change`, so a stale in-memory copy never rewrites other Workstreams.
 * Updates are serialized in-process. Fails (writing nothing) when the file is malformed. Returns the document written.
 */
export const updateWorkstreams = Effect.fn('updateWorkstreams')(function* (
  change: (workstreams: readonly Workstream[]) => readonly Workstream[],
) {
  return yield* writeLock.withPermits(1)(
    Effect.gen(function* () {
      const current = yield* readWorkstreams();
      const next: WorkstreamsDocument = { workstreams: change(current.workstreams) };
      yield* writeJsonFile(yield* workstreamsPath(), WorkstreamsDocumentJsonString, next);
      return next;
    }),
  );
});

const sameSession = (a: WorkstreamSession, b: WorkstreamSession): boolean =>
  a.launchTarget === b.launchTarget && a.sessionId === b.sessionId;

const withoutSession = (workstreams: readonly Workstream[], session: WorkstreamSession): readonly Workstream[] =>
  workstreams.map(ws => ({ ...ws, sessions: ws.sessions.filter(item => !sameSession(item, session)) }));

const mapWorkstream = (workstreams: readonly Workstream[], id: string, change: (ws: Workstream) => Workstream) =>
  workstreams.map(ws => (ws.id === id ? change(ws) : ws));

/** A new empty, unarchived Workstream (not yet written). */
export const makeWorkstream = (name: string, trackers: readonly TrackerRef[]): Workstream => ({
  id: crypto.randomUUID(),
  name,
  trackers,
  archived: false,
  sessions: [],
});

/** Appends `workstream`; returns the document written. */
export const addWorkstream = (workstream: Workstream) => updateWorkstreams(workstreams => [...workstreams, workstream]);

/** Creates an empty, unarchived Workstream and returns it. */
export const createWorkstream = Effect.fn('createWorkstream')(function* (
  name: string,
  trackers: readonly TrackerRef[],
) {
  const workstream = makeWorkstream(name, trackers);
  yield* addWorkstream(workstream);
  return workstream;
});

/** Renames and/or replaces the Tracker refs of a Workstream. */
export const updateWorkstream = (
  id: string,
  patch: { readonly name?: string; readonly trackers?: readonly TrackerRef[] },
) =>
  updateWorkstreams(workstreams =>
    mapWorkstream(workstreams, id, ws => ({
      ...ws,
      name: patch.name ?? ws.name,
      trackers: patch.trackers ?? ws.trackers,
    })),
  );

export const setWorkstreamArchived = (id: string, archived: boolean) =>
  updateWorkstreams(workstreams => mapWorkstream(workstreams, id, ws => ({ ...ws, archived })));

/** Deleting a Workstream orphans its sessions (they return to the Sessions Page). */
export const deleteWorkstream = (id: string) =>
  updateWorkstreams(workstreams => workstreams.filter(ws => ws.id !== id));

/** A session belongs to at most one Workstream: adopting removes it from any other first. */
export const adoptSession = (id: string, session: WorkstreamSession) =>
  updateWorkstreams(workstreams =>
    mapWorkstream(withoutSession(workstreams, session), id, ws => ({ ...ws, sessions: [...ws.sessions, session] })),
  );

export const orphanSession = (session: WorkstreamSession) =>
  updateWorkstreams(workstreams => withoutSession(workstreams, session));
