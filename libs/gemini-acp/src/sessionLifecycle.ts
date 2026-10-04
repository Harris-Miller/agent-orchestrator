import { LaunchTargetSchema, readAdapterRoster, withAdapterRosterLock, writeAdapterRoster } from '@lib/ao-home';
import type { AdapterRosterEntry } from '@lib/ao-home';
import { Effect, Ref, Schema } from 'effect';

export const GEMINI_ACP_LAUNCH_TARGET = Schema.decodeSync(LaunchTargetSchema)('gemini-acp');

export type LoadedSet = Ref.Ref<Set<string>>;

export const makeLoadedSet = (): Effect.Effect<LoadedSet> => Ref.make(new Set<string>());

export const isLoaded = Effect.fn('isLoaded')(function* (loaded: LoadedSet, sessionId: string) {
  const set = yield* Ref.get(loaded);
  return set.has(sessionId);
});

export const markLoaded = Effect.fn('markLoaded')(function* (loaded: LoadedSet, sessionId: string) {
  yield* Ref.update(loaded, set => new Set([...set, sessionId]));
});

export const unmarkLoaded = Effect.fn('unmarkLoaded')(function* (loaded: LoadedSet, sessionId: string) {
  yield* Ref.update(loaded, set => {
    const next = new Set(set);
    next.delete(sessionId);
    return next;
  });
});

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
