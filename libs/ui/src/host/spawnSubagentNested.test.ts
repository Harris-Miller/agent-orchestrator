/** Nested Spawned subagent sessions (#277): a child spawns its own children; limits, mirror placement and routing. */
import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';

import { backendHarnessSnapshotAtom } from '../atoms/backendState.atoms.ts';
import { createHostRuntime } from '../createHostRuntime.ts';
import { createChatAtoms } from '../atoms/chat.atoms.ts';
import { runAtomFn } from '../atoms/runAtomFn.testing.ts';
import type { PendingPermission } from './pendingInteractions.ts';
import { bearerOf, CLAUDE, CODEX } from '../atoms/fakeAgent.testing.ts';
import type { McpReceived } from '../atoms/fakeAgent.testing.ts';
import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';
import { endSpawnedChildren, onLaunchTargetConnectionLost } from '../atoms/spawnedSubagent/index.ts';
import { allLinks, linkOf } from '../atoms/spawnedSubagent/links.ts';

import { handleHubToolCall } from './hubSessions.ts';
import { getSubagent, hasBackgroundActivity } from './subagent.ts';
import { anyPromptTurnWorking } from './turnActivity.ts';
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

type Reg = Effect.Success<ReturnType<typeof nestedSetup>>['registry'];
const stateOf = (registry: Reg, id: string) =>
  getSubagent(registry.get(backendHarnessSnapshotAtom(CODEX)).subagents, id)?.state?.state;

/** Three levels: claude-1 under the Selected session, claude-2 under it, claude-3 under that; all still running. */
const chain = Effect.fnUntraced(function* () {
  const h = yield* nestedSetup();
  yield* h.spawn({ runInBackground: true });
  yield* until(() => h.childCalls.includes('prompt:claude-1'));
  yield* h.spawnAs(0);
  yield* until(() => h.childCalls.includes('prompt:claude-2'));
  yield* h.spawnAs(1);
  yield* until(() => h.childCalls.includes('prompt:claude-3'));
  return h;
});

describe('nested lifecycle', () => {
  it.effect('closing the Selected session ends every descendant, deepest first', () =>
    Effect.gen(function* () {
      const h = yield* chain();
      yield* endSpawnedChildren(h.registry, { launchTarget: CODEX, sessionId: PARENT });

      assert.deepStrictEqual(allLinks(h.registry), []);
      assert.deepStrictEqual(
        ['claude-1', 'claude-2', 'claude-3'].map(id => stateOf(h.registry, id)),
        ['cancelled', 'cancelled', 'cancelled'],
      );
      const closes = h.childCalls.filter(call => call.startsWith('close:'));
      assert.deepStrictEqual(closes, ['close:claude-3', 'close:claude-2', 'close:claude-1']);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );

  it.effect("cancelling the Selected session's Prompt turn cancels its foreground descendants", () =>
    Effect.gen(function* () {
      const h = yield* nestedSetup();
      h.setParent({ pendingClientRequest: 'prompt' });
      const first = yield* Effect.forkChild(h.spawn());
      yield* until(() => h.childCalls.includes('prompt:claude-1'));
      const second = yield* Effect.forkChild(
        h.callAs(0, 'spawn_subagent', {
          configOptions: { model: 'o1' },
          description: 'Nested',
          launchTarget: CLAUDE,
          task: 'Do more',
        }),
      );
      yield* until(() => h.childCalls.includes('prompt:claude-2'));

      h.setParent({ promptCancelRequested: true });
      yield* until(() => h.childCalls.includes('cancel:claude-1') && h.childCalls.includes('cancel:claude-2'));
      yield* Deferred.succeed(h.release, null);

      assert.isTrue((yield* Fiber.join(first)).isError);
      assert.isTrue((yield* Fiber.join(second)).isError);
    }).pipe(Effect.scoped),
  );

  it.effect('Connection lost on the Selected session target ends every descendant', () =>
    Effect.gen(function* () {
      const h = yield* chain();
      yield* onLaunchTargetConnectionLost(h.registry, CODEX);

      assert.deepStrictEqual(allLinks(h.registry), []);
      assert.deepStrictEqual(
        ['claude-1', 'claude-2', 'claude-3'].map(id => stateOf(h.registry, id)),
        ['cancelled', 'cancelled', 'cancelled'],
      );
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );

  it.effect('a finished child stays running while it has a live descendant, and counts as Background follow-up', () =>
    Effect.gen(function* () {
      const gates = [Deferred.makeUnsafe<null>(), Deferred.makeUnsafe<null>()];
      let started = 0;
      const received: McpReceived[] = [];
      const h = yield* setup({
        duringPrompt: Effect.suspend(() => {
          started += 1;
          return Deferred.await(gates[Math.min(started - 1, 1)]);
        }),
        mcp: { received },
      });
      yield* h.spawn({ runInBackground: true });
      yield* until(() => h.childCalls.includes('prompt:claude-1'));
      yield* handleHubToolCall(
        {
          args: {
            configOptions: { model: 'o1' },
            description: 'Nested',
            launchTarget: CLAUDE,
            runInBackground: true,
            task: 'Do more',
          },
          token: bearerOf(received[0].servers),
          tool: 'spawn_subagent',
        },
        { registry: h.registry },
      ).pipe(Effect.provide(mockHostLayer));
      yield* until(() => h.childCalls.includes('prompt:claude-2'));

      // The child's turn ends; its own outcome resolves, but its mirror keeps running for the grandchild.
      yield* Deferred.succeed(gates[0], null);
      yield* until(() => linkOf(h.registry, key('claude-1'))?.finish !== undefined);
      assert.strictEqual(stateOf(h.registry, 'claude-1'), 'running');
      const snapshot = h.registry.get(backendHarnessSnapshotAtom(CODEX));
      assert.isTrue(hasBackgroundActivity(snapshot, PARENT));
      assert.isTrue(anyPromptTurnWorking([snapshot]));

      // The last descendant to settle stamps the ancestor.
      yield* Deferred.succeed(gates[1], null);
      yield* until(() => stateOf(h.registry, 'claude-1') === 'completed');
      assert.strictEqual(stateOf(h.registry, 'claude-2'), 'completed');
      assert.isFalse(hasBackgroundActivity(h.registry.get(backendHarnessSnapshotAtom(CODEX)), PARENT));
    }).pipe(Effect.scoped),
  );
});

describe('nested pending interactions', () => {
  it.effect('a grandchild-of-a-grandchild permission shows on the Selected snapshot and is answerable', () =>
    Effect.gen(function* () {
      const h = yield* chain();
      const { respondPermissionAtomFn } = createChatAtoms(createHostRuntime(mockHostLayer));
      h.registry.mount(respondPermissionAtomFn);
      const answers: unknown[] = [];
      h.childFold.onPermissionRequest('claude-3', { options: [] } as unknown as PendingPermission['request'], r => {
        answers.push(r);
      });
      const pending = () =>
        getSubagent(h.registry.get(backendHarnessSnapshotAtom(CODEX)).subagents, 'claude-3')?.pendingPermission;
      yield* until(() => pending() !== undefined);
      assert.isDefined(pending());
      assert.isFalse(anyPromptTurnWorking([h.registry.get(backendHarnessSnapshotAtom(CODEX))]));

      yield* runAtomFn(h.registry, respondPermissionAtomFn, {
        launchTarget: CLAUDE,
        optionId: 'allow',
        sessionId: 'claude-3',
      });
      yield* until(() => pending() === undefined);
      assert.deepStrictEqual(answers, [{ outcome: { optionId: 'allow', outcome: 'selected' } }]);
      yield* Deferred.succeed(h.release, null);
    }).pipe(Effect.scoped),
  );
});
