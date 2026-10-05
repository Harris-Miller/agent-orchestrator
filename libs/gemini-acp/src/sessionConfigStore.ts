import { Effect, Ref } from 'effect';

import type { GeminiSessionConfigSnapshot } from './rewriteSessionConfiguration.ts';

export type SessionConfigStore = Ref.Ref<Map<string, GeminiSessionConfigSnapshot>>;

export const makeSessionConfigStore = (): Effect.Effect<SessionConfigStore> =>
  Ref.make(new Map<string, GeminiSessionConfigSnapshot>());

export const putSessionConfig = Effect.fn('putSessionConfig')(function* (
  store: SessionConfigStore,
  sessionId: string,
  snapshot: GeminiSessionConfigSnapshot,
) {
  yield* Ref.update(store, map => {
    const next = new Map(map);
    next.set(sessionId, snapshot);
    return next;
  });
});

export const getSessionConfig = Effect.fn('getSessionConfig')(function* (store: SessionConfigStore, sessionId: string) {
  const map = yield* Ref.get(store);
  return map.get(sessionId);
});

export const patchSessionConfig = Effect.fn('patchSessionConfig')(function* (
  store: SessionConfigStore,
  sessionId: string,
  patch: (snapshot: GeminiSessionConfigSnapshot) => GeminiSessionConfigSnapshot,
) {
  const current = yield* getSessionConfig(store, sessionId);
  if (current === undefined) {
    return undefined;
  }
  const next = patch(current);
  yield* putSessionConfig(store, sessionId, next);
  return next;
});
