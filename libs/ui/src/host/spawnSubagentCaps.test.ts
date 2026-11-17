/** What bounds spawning: a Spawned subagent session cannot spawn, and a parent has at most eight live children. */
import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect } from 'effect';

import { bearerOf, CODEX } from '../atoms/fakeAgent.testing.ts';
import type { McpReceived } from '../atoms/fakeAgent.testing.ts';
import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';

import { handleHubToolCall } from './hubSessions.ts';
import { CHILD, setup, until } from './spawnSubagent.testing.ts';

describe('spawn caps', () => {
  it.effect('a Spawned subagent session cannot spawn, and no session is created for it', () =>
    Effect.gen(function* () {
      const received: McpReceived[] = [];
      const release = Deferred.makeUnsafe<null>();
      const h = yield* setup({ duringPrompt: Deferred.await(release), mcp: { received } });
      yield* h.spawn({ runInBackground: true });
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));
      const callsBefore = [...h.parentCalls];

      // The child holds a hub credential of its own (every session does); the handler refuses it.
      const grandchild = yield* handleHubToolCall(
        {
          args: { description: 'Nested', launchTarget: CODEX, task: 'Do more' },
          token: bearerOf(received[0].servers),
          tool: 'spawn_subagent',
        },
        { registry: h.registry },
      ).pipe(Effect.provide(mockHostLayer));

      assert.deepStrictEqual(grandchild, { isError: true, text: 'A subagent cannot start subagents of its own.' });
      assert.deepStrictEqual(h.parentCalls, callsBefore);
      yield* Deferred.succeed(release, null);
    }).pipe(Effect.scoped),
  );

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
});
