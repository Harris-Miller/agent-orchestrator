import { assert, describe, it } from '@effect/vitest';
import { Atom, AtomRegistry } from 'effect/reactivity';
import { Effect } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';

import { mockHostLayer } from './mockHostLayer.testing.ts';
import { createSessionFsListingAtoms, sessionFsListingAtom, sessionFsListingKey } from './sessionFsListing.atoms.ts';
import { runAtomFn } from './runAtomFn.ts';

const setup = Effect.fnUntraced(function* () {
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), r =>
    Effect.sync(() => {
      r.dispose();
    }),
  );
  const { refreshSessionFsListingAtomFn } = createSessionFsListingAtoms(
    createHostRuntime(mockHostLayer),
    Atom.make<readonly string[]>([]),
  );
  registry.mount(refreshSessionFsListingAtomFn);
  return { refreshSessionFsListingAtomFn, registry };
});

describe('refreshSessionFsListingAtomFn', () => {
  it.effect('keeps the previous entries when a rescan fails', () =>
    Effect.gen(function* () {
      const { refreshSessionFsListingAtomFn, registry } = yield* setup();
      const key = sessionFsListingKey('s1', '/work');
      const entries = [{ kind: 'file', path: 'a.ts' }] as const;
      registry.set(sessionFsListingAtom(key), { cwd: '/work', entries, status: 'ready' });

      yield* runAtomFn(registry, refreshSessionFsListingAtomFn, { cwd: '/work', sessionId: 's1' });

      assert.deepStrictEqual(registry.get(sessionFsListingAtom(key)).entries, entries);
    }),
  );

  it.effect('does not leave a failed first load on loading', () =>
    Effect.gen(function* () {
      const { refreshSessionFsListingAtomFn, registry } = yield* setup();
      yield* runAtomFn(registry, refreshSessionFsListingAtomFn, { cwd: '/work', sessionId: 's1' });
      assert.strictEqual(registry.get(sessionFsListingAtom(sessionFsListingKey('s1', '/work'))).status, 'empty');
    }),
  );
});
