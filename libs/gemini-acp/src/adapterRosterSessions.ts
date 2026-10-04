import { LaunchTargetSchema, readAdapterRoster, withAdapterRosterLock, writeAdapterRoster } from '@lib/ao-home';
import type { AdapterRosterDocument, AdapterRosterEntry } from '@lib/ao-home';
import { Effect, Schema } from 'effect';

export const GEMINI_ACP_LAUNCH_TARGET = Schema.decodeSync(LaunchTargetSchema)('gemini-acp');

const nowIso = (): string => new Date().toISOString();

const withLockedRoster = Effect.fn('withLockedRoster')(function* <A, E, R>(
  use: (doc: AdapterRosterDocument) => Effect.Effect<A, E, R>,
) {
  return yield* withAdapterRosterLock(
    GEMINI_ACP_LAUNCH_TARGET,
    Effect.gen(function* () {
      const doc = yield* readAdapterRoster(GEMINI_ACP_LAUNCH_TARGET);
      return yield* use(doc);
    }),
  );
});

/** Read-modify-write sessions under the roster lock. Return `undefined` to skip the write. */
const updateRosterSessions = Effect.fn('updateRosterSessions')(function* (
  update: (sessions: readonly AdapterRosterEntry[]) => readonly AdapterRosterEntry[] | undefined,
) {
  yield* withLockedRoster(doc => {
    const sessions = update(doc.sessions);
    if (sessions === undefined) {
      return Effect.void;
    }
    return writeAdapterRoster(GEMINI_ACP_LAUNCH_TARGET, { sessions });
  });
});

export const listRosterSessions = Effect.fn('listRosterSessions')(function* (cwd?: null | string) {
  return yield* withLockedRoster(doc => {
    const sessions = cwd === undefined || cwd === null ? doc.sessions : doc.sessions.filter(entry => entry.cwd === cwd);
    return Effect.succeed({ sessions });
  });
});

export const upsertRosterEntry = Effect.fn('upsertRosterEntry')(function* (entry: {
  readonly cwd: string;
  readonly sessionId: string;
  readonly title?: string;
}) {
  const updatedAt = nowIso();
  yield* updateRosterSessions(sessions => {
    const nextEntry: AdapterRosterEntry = {
      cwd: entry.cwd,
      sessionId: entry.sessionId,
      updatedAt,
      ...(entry.title === undefined ? {} : { title: entry.title }),
    };
    const index = sessions.findIndex(s => s.sessionId === entry.sessionId);
    return index === -1 ? [...sessions, nextEntry] : sessions.map((s, i) => (i === index ? { ...s, ...nextEntry } : s));
  });
});

/** Soft close: refresh `updatedAt` when the row exists; no-op if missing. Does not remove. */
export const touchRosterEntry = Effect.fn('touchRosterEntry')(function* (sessionId: string) {
  const updatedAt = nowIso();
  yield* updateRosterSessions(sessions => {
    const index = sessions.findIndex(s => s.sessionId === sessionId);
    if (index === -1) {
      return undefined;
    }
    return sessions.map((s, i) => (i === index ? { ...s, updatedAt } : s));
  });
});

/** Persist `session_info_update.title` onto a durable roster row when known. */
export const patchRosterTitle = Effect.fn('patchRosterTitle')(function* (sessionId: string, title: null | string) {
  const updatedAt = nowIso();
  yield* updateRosterSessions(sessions => {
    const index = sessions.findIndex(s => s.sessionId === sessionId);
    if (index === -1) {
      return undefined;
    }
    return sessions.map((s, i) => {
      if (i !== index) {
        return s;
      }
      if (title === null) {
        const { title: _removed, ...rest } = s;
        return { ...rest, updatedAt };
      }
      return { ...s, title, updatedAt };
    });
  });
});

export const removeRosterEntry = Effect.fn('removeRosterEntry')(function* (sessionId: string) {
  yield* updateRosterSessions(sessions => sessions.filter(s => s.sessionId !== sessionId));
});
