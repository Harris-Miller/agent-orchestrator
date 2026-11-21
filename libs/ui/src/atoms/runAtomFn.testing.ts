import { Effect } from 'effect';
import type { AsyncResult, Atom } from 'effect/reactivity';
import { AtomRegistry } from 'effect/reactivity';

export const runAtomFn = <A, E, W>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>,
  arg: W,
): Effect.Effect<A, E> =>
  Effect.gen(function* () {
    registry.set(atom, arg);
    return yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true });
  });
