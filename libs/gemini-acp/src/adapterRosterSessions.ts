import { LaunchTargetSchema, readAdapterRoster, withAdapterRosterLock, writeAdapterRoster } from '@lib/ao-home';
import type { AdapterRosterEntry } from '@lib/ao-home';
import { Effect, Schema } from 'effect';

export const GEMINI_ACP_LAUNCH_TARGET = Schema.decodeSync(LaunchTargetSchema)('gemini-acp');

const nowIso = (): string => new Date().toISOString();

export const listRosterSessions = Effect.fn('listRosterSessions')(function* (cwd?: null | string) {
  return yield* withAdapterRosterLock(
    GEMINI_ACP_LAUNCH_TARGET,
    Effect.gen(function* () {
      const doc = yield* readAdapterRoster(GEMINI_ACP_LAUNCH_TARGET);
      const sessions =
        cwd === undefined || cwd === null ? doc.sessions : doc.sessions.filter(entry => entry.cwd === cwd);
      return { sessions };
    }),
  );
});

export const upsertRosterEntry = Effect.fn('upsertRosterEntry')(function* (entry: {
  readonly cwd: string;
  readonly sessionId: string;
  readonly title?: string;
}) {
  const updatedAt = nowIso();
  yield* withAdapterRosterLock(
    GEMINI_ACP_LAUNCH_TARGET,
    Effect.gen(function* () {
      const doc = yield* readAdapterRoster(GEMINI_ACP_LAUNCH_TARGET);
      const nextEntry: AdapterRosterEntry = {
        cwd: entry.cwd,
        sessionId: entry.sessionId,
        updatedAt,
        ...(entry.title === undefined ? {} : { title: entry.title }),
      };
      const index = doc.sessions.findIndex(s => s.sessionId === entry.sessionId);
      const sessions =
        index === -1
          ? [...doc.sessions, nextEntry]
          : doc.sessions.map((s, i) => (i === index ? { ...s, ...nextEntry } : s));
      yield* writeAdapterRoster(GEMINI_ACP_LAUNCH_TARGET, { sessions });
    }),
  );
});

/** Soft close: refresh `updatedAt` when the row exists; no-op if missing. Does not remove. */
export const touchRosterEntry = Effect.fn('touchRosterEntry')(function* (sessionId: string) {
  const updatedAt = nowIso();
  yield* withAdapterRosterLock(
    GEMINI_ACP_LAUNCH_TARGET,
    Effect.gen(function* () {
      const doc = yield* readAdapterRoster(GEMINI_ACP_LAUNCH_TARGET);
      const index = doc.sessions.findIndex(s => s.sessionId === sessionId);
      if (index === -1) {
        return;
      }
      const sessions = doc.sessions.map((s, i) => (i === index ? { ...s, updatedAt } : s));
      yield* writeAdapterRoster(GEMINI_ACP_LAUNCH_TARGET, { sessions });
    }),
  );
});

/** Persist `session_info_update.title` onto a durable roster row when known. */
export const patchRosterTitle = Effect.fn('patchRosterTitle')(function* (sessionId: string, title: null | string) {
  const updatedAt = nowIso();
  yield* withAdapterRosterLock(
    GEMINI_ACP_LAUNCH_TARGET,
    Effect.gen(function* () {
      const doc = yield* readAdapterRoster(GEMINI_ACP_LAUNCH_TARGET);
      const index = doc.sessions.findIndex(s => s.sessionId === sessionId);
      if (index === -1) {
        return;
      }
      const sessions = doc.sessions.map((s, i) => {
        if (i !== index) {
          return s;
        }
        if (title === null) {
          const { title: _removed, ...rest } = s;
          return { ...rest, updatedAt };
        }
        return { ...s, title, updatedAt };
      });
      yield* writeAdapterRoster(GEMINI_ACP_LAUNCH_TARGET, { sessions });
    }),
  );
});

export const removeRosterEntry = Effect.fn('removeRosterEntry')(function* (sessionId: string) {
  yield* withAdapterRosterLock(
    GEMINI_ACP_LAUNCH_TARGET,
    Effect.gen(function* () {
      const doc = yield* readAdapterRoster(GEMINI_ACP_LAUNCH_TARGET);
      yield* writeAdapterRoster(GEMINI_ACP_LAUNCH_TARGET, {
        sessions: doc.sessions.filter(s => s.sessionId !== sessionId),
      });
    }),
  );
});
