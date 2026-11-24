/** Nested Spawned subagent sessions (#277): a child spawns its own children; limits, mirror placement and routing. */
import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect } from 'effect';

import { backendHarnessSnapshotAtom } from '../atoms/backendState.atoms.ts';
import { bearerOf, CLAUDE } from '../atoms/fakeAgent.testing.ts';
import type { McpReceived } from '../atoms/fakeAgent.testing.ts';
import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';
import { allLinks, linkOf } from '../atoms/spawnedSubagent/links.ts';

import { handleHubToolCall } from './hubSessions.ts';
import { getSubagent } from './subagent.ts';
import { PARENT, setup, until } from './spawnSubagent.testing.ts';

/** Start the harness with children that stay running until `release` is completed; `received` holds each child's credential. */
const nestedSetup = Effect.fnUntraced(function* () {
  const received: McpReceived[] = [];
  const release = Deferred.makeUnsafe<null>();
  const h = yield* setup({ duringPrompt: Deferred.await(release), mcp: { received } });
  /** A hub call made with the credential of the `index`th Claude session created (0 = `claude-1`). */
  const callAs = (index: number, tool: string, args: unknown) =>
    handleHubToolCall({ args, token: bearerOf(received[index].servers), tool }, { registry: h.registry }).pipe(
      Effect.provide(mockHostLayer),
    );
  const spawnAs = (index: number, task = 'Do more') =>
    callAs(index, 'spawn_subagent', {
      configOptions: { model: 'o1' },
      description: `Nested ${task}`,
      launchTarget: CLAUDE,
      runInBackground: true,
      task,
    });
  return { ...h, callAs, release, spawnAs };
});

const key = (id: string) => ({ launchTarget: CLAUDE, sessionId: id });

describe('nested spawn', () => {
  it.effect('a child spawns a child: mirror on the Selected session target, row in the parent entry', () =>
    Effect.gen(function* () {
      const h = yield* nestedSetup();
      yield* h.spawn({ runInBackground: true });
      yield* until(() => h.childCalls.includes('prompt:claude-1'));
      const nested = yield* h.spawnAs(0);
      assert.isFalse(nested.isError);

      const link = linkOf(h.registry, key('claude-2'));
      assert.deepStrictEqual(
        [link?.parentSessionId, link?.rootSessionId, link?.mirrorLaunchTarget],
        ['claude-1', PARENT, 'codex-acp'],
      );
      const selected = h.registry.get(backendHarnessSnapshotAtom('codex-acp'));
      assert.deepStrictEqual(Object.keys(selected.subagents).sort(), ['claude-1', 'claude-2']);
      assert.strictEqual(getSubagent(selected.subagents, 'claude-2')?.parentSessionId, 'claude-1');
      assert.deepStrictEqual(Object.keys(h.registry.get(backendHarnessSnapshotAtom(CLAUDE)).subagents), []);

      // The row sits in the child's own root entry, and the projection carries it onto the child's mirror.
      const rowsOf = (items: readonly { readonly kind: string }[]) => items.filter(item => item.kind === 'subagent');
      const root = h.registry.get(backendHarnessSnapshotAtom(CLAUDE)).sessions['claude-1'];
      assert.strictEqual(rowsOf(root.transcript.items).length, 1);
      yield* until(() => rowsOf(getSubagent(selected.subagents, 'claude-1')?.transcript.items ?? []).length === 1);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );

  it.effect('refuses a spawn that would nest deeper than three levels', () =>
    Effect.gen(function* () {
      const h = yield* nestedSetup();
      yield* h.spawn({ runInBackground: true });
      yield* until(() => h.childCalls.includes('prompt:claude-1'));
      assert.isFalse((yield* h.spawnAs(0)).isError);
      yield* until(() => h.childCalls.includes('prompt:claude-2'));
      assert.isFalse((yield* h.spawnAs(1)).isError);
      yield* until(() => h.childCalls.includes('prompt:claude-3'));
      const created = h.childCalls.filter(call => call.startsWith('new:')).length;

      const tooDeep = yield* h.spawnAs(2);
      assert.isTrue(tooDeep.isError);
      assert.include(tooDeep.text, 'at most 3 levels');
      assert.strictEqual(h.childCalls.filter(call => call.startsWith('new:')).length, created);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );

  it.effect('only the direct parent can wait on or cancel a child', () =>
    Effect.gen(function* () {
      const h = yield* nestedSetup();
      yield* h.spawn({ runInBackground: true });
      yield* until(() => h.childCalls.includes('prompt:claude-1'));
      yield* h.spawnAs(0);
      yield* until(() => h.childCalls.includes('prompt:claude-2'));

      const waited = yield* h.call('wait_subagent', { ids: ['claude-2'] });
      assert.deepStrictEqual(waited, { isError: true, text: 'You have no subagent with id "claude-2".' });
      const cancelled = yield* h.call('cancel_subagent', { subagentId: 'claude-2' });
      assert.deepStrictEqual(cancelled, { isError: true, text: 'You have no subagent with id "claude-2".' });
      assert.isFalse(h.childCalls.includes('cancel:claude-2'));

      const own = yield* h.callAs(0, 'cancel_subagent', { subagentId: 'claude-2' });
      assert.isFalse(own.isError);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );

  it.effect('caps live children per parent and live descendants per Selected session', () =>
    Effect.gen(function* () {
      const h = yield* nestedSetup();
      for (let i = 0; i < 3; i += 1) {
        assert.isFalse((yield* h.spawn({ runInBackground: true, task: `Child ${i}` })).isError);
      }
      yield* until(() => h.childCalls.includes('prompt:claude-3'));
      // 3 children + 8 + 8 grandchildren = 19; the third child may add 5 more before the 24 cap.
      for (const parent of [0, 1]) {
        const results = yield* Effect.all(
          Array.from({ length: 8 }, (_unused, i) => h.spawnAs(parent, `G${parent}-${i}`)),
          { concurrency: 'unbounded' },
        );
        assert.strictEqual(results.filter(result => result.isError).length, 0);
      }
      const results = yield* Effect.all(
        Array.from({ length: 8 }, (_unused, i) => h.spawnAs(2, `G2-${i}`)),
        { concurrency: 'unbounded' },
      );
      assert.strictEqual(results.filter(result => !result.isError).length, 5);
      const refused = results.find(result => result.isError);
      assert.include(refused?.text ?? '', '24 subagents');
      assert.strictEqual(allLinks(h.registry).length, 24);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );
});
