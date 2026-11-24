/** What bounds spawning: a parent has at most eight live children (nesting limits: spawnSubagentNested.test.ts). */
import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect } from 'effect';

import { setup, until } from './spawnSubagent.testing.ts';

describe('spawn caps', () => {
  it.effect('refuses a ninth live child, and a finished child frees its slot', () =>
    Effect.gen(function* () {
      const gates = Array.from({ length: 9 }, () => Deferred.makeUnsafe<null>());
      let started = 0;
      const h = yield* setup({
        duringPrompt: Effect.suspend(() => {
          started += 1;
          return Deferred.await(gates[started - 1]);
        }),
      });
      for (let i = 1; i <= 8; i += 1) {
        const result = yield* h.spawn({ runInBackground: true, task: `Task ${i}` });
        assert.isFalse(result.isError);
      }
      yield* until(() => started === 8);

      const ninth = yield* h.spawn({ runInBackground: true, task: 'Task 9' });
      assert.isTrue(ninth.isError);
      assert.include(ninth.text, '8 subagents running');
      assert.strictEqual(h.childCalls.filter(call => call === 'new:claude').length, 8);

      yield* Deferred.succeed(gates[0], null);
      yield* until(() => h.parentCalls.includes('prompt:bound-1'));
      const again = yield* h.spawn({ runInBackground: true, task: 'Task 9' });
      assert.isFalse(again.isError);
      for (const gate of gates) {
        yield* Deferred.succeed(gate, null);
      }
    }).pipe(Effect.scoped),
  );

  it.effect('parallel spawns never exceed eight live children', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const h = yield* setup({ duringPrompt: Deferred.await(release) });
      const results = yield* Effect.all(
        Array.from({ length: 12 }, (_unused, i) => h.spawn({ runInBackground: true, task: `Task ${i}` })),
        { concurrency: 'unbounded' },
      );
      assert.strictEqual(results.filter(result => !result.isError).length, 8);
      assert.strictEqual(results.filter(result => result.isError).length, 4);
      assert.strictEqual(h.childCalls.filter(call => call === 'new:claude').length, 8);
      yield* Deferred.succeed(release, null);
    }).pipe(Effect.scoped),
  );
});
