import { Effect, Ref } from 'effect';

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
