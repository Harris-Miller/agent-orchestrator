/** A Spawned subagent starts with its parent's Additional directories, sent only when the child's Agent is capable. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import type { SessionRequest } from '../atoms/fakeAgent.testing.ts';

import { setup } from './spawnSubagent.testing.ts';

describe('spawn_subagent Additional directories', () => {
  it.effect.each([
    { capable: true, sent: ['/lib/a', '/lib/b'] },
    { capable: false, sent: undefined },
  ])('the child inherits the parent list (child Agent capable: $capable)', ({ capable, sent }) =>
    Effect.gen(function* () {
      const requests: SessionRequest[] = [];
      const h = yield* setup({ additionalDirectories: capable, requests });
      h.setParent({ additionalDirectories: ['/lib/a', '/lib/b'] });

      yield* h.spawn({ runInBackground: true });

      assert.deepStrictEqual(requests[0].params.additionalDirectories, sent);
      assert.strictEqual(requests[0].params.cwd, '/w');
    }).pipe(Effect.scoped),
  );

  it.effect('a parent without Additional directories spawns a child without them', () =>
    Effect.gen(function* () {
      const requests: SessionRequest[] = [];
      const h = yield* setup({ additionalDirectories: true, requests });

      yield* h.spawn({ runInBackground: true });

      assert.isFalse('additionalDirectories' in requests[0].params);
    }).pipe(Effect.scoped),
  );
});
