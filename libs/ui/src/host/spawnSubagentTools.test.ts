/** `spawn_subagent` and `wait_subagent` as an agent calls them: through `handleHubToolCall` with the caller's credential. */
import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';

import { backendHarnessSnapshotAtom } from '../atoms/backendState.atoms.ts';
import { CODEX, enableProviders } from '../atoms/fakeAgent.testing.ts';
import { allLinks } from '../atoms/subagentLinkRegistry.ts';

import { getSubagent } from './subagent.ts';
import { answer, CHILD, setup, until } from './spawnSubagent.testing.ts';

describe('spawn_subagent (foreground)', () => {
  it.effect('returns exactly the final agent message of the child', () =>
    Effect.gen(function* () {
      const h = yield* setup({
        duringPrompt: Effect.sync(() => {
          h.childFold.onSessionUpdate(CHILD, answer('thinking'));
          h.childFold.onSessionUpdate(CHILD, {
            sessionUpdate: 'tool_call',
            status: 'done',
            title: 'Read',
            toolCallId: 't',
          });
          h.childFold.onSessionUpdate(CHILD, answer('The diff is fine.'));
        }),
      });
      assert.deepStrictEqual(yield* h.spawn(), { isError: false, text: 'The diff is fine.' });
    }).pipe(Effect.scoped),
  );

  it.effect('a failed, cancelled or message-less child is a tool error naming the cause', () =>
    Effect.gen(function* () {
      const failed = yield* (yield* setup({ prompt: 'fail' })).spawn();
      assert.isTrue(failed.isError);
      assert.include(failed.text, 'failed');
      const cancelled = yield* (yield* setup({ prompt: 'cancelled' })).spawn();
      assert.deepStrictEqual(cancelled, { isError: true, text: 'The subagent was cancelled.' });
      const silent = yield* (yield* setup()).spawn();
      assert.deepStrictEqual(silent, {
        isError: true,
        text: 'The subagent finished without producing a final message.',
      });
    }).pipe(Effect.scoped),
  );

  it.effect('wait_subagent reports a message-less child as failed, like the foreground result', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const started = yield* h.spawn({ runInBackground: true });
      const { subagentId } = JSON.parse(started.text) as { subagentId: string };
      const waited = yield* h.call('wait_subagent', { ids: [subagentId] });
      assert.include(waited.text, 'status="failed"');
      assert.include(waited.text, 'The subagent finished without producing a final message.');
    }).pipe(Effect.scoped),
  );

  it.effect('refuses an unknown, same-target or unusable launch target without creating a session', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const unknown = yield* h.spawn({ launchTarget: 'toaster' });
      assert.include(unknown.text, 'list_subagent_targets');
      const same = yield* h.spawn({ launchTarget: CODEX });
      assert.include(same.text, 'different launch target');
      enableProviders(h.registry, [CODEX]);
      const disabled = yield* h.spawn();
      assert.include(disabled.text, 'disabled');
      assert.deepStrictEqual(h.childCalls, []);
      assert.isTrue(unknown.isError && same.isError && disabled.isError);
    }).pipe(Effect.scoped),
  );

  it.effect('rejects bad arguments as invalid', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      assert.include((yield* h.spawn({ task: '   ' })).text, 'Invalid arguments');
    }).pipe(Effect.scoped),
  );

  it.effect('a parent Prompt turn cancel cancels the child', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const h = yield* setup({ duringPrompt: Deferred.await(release) });
      h.setParent({ pendingClientRequest: 'prompt' });
      const call = yield* Effect.forkChild(h.spawn());
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));

      h.setParent({ promptCancelRequested: true });
      yield* until(() => h.childCalls.includes(`cancel:${CHILD}`));
      yield* Deferred.succeed(release, null);

      assert.isTrue((yield* Fiber.join(call)).isError);
    }).pipe(Effect.scoped),
  );

  it.effect('an agent-initiated parent turn ending does not cancel the child', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const h = yield* setup({
        duringPrompt: Effect.andThen(
          Deferred.await(release),
          Effect.sync(() => {
            h.childFold.onSessionUpdate(CHILD, answer('done'));
          }),
        ),
      });
      // No Harness-started prompt on the parent: it has no Pending client request to end.
      const call = yield* Effect.forkChild(h.spawn());
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));
      for (let i = 0; i < 20; i += 1) {
        yield* Effect.yieldNow;
      }
      assert.notInclude(h.childCalls, `cancel:${CHILD}`);
      yield* Deferred.succeed(release, null);
      assert.deepStrictEqual(yield* Fiber.join(call), { isError: false, text: 'done' });
    }).pipe(Effect.scoped),
  );

  it.effect('a child still running at the bound answers running, and wait_subagent collects it later', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const h = yield* setup({
        duringPrompt: Effect.andThen(
          Deferred.await(release),
          Effect.sync(() => {
            h.childFold.onSessionUpdate(CHILD, answer('late result'));
          }),
        ),
      });
      const call = yield* Effect.forkChild(h.spawn());
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));
      yield* TestClock.adjust('240 seconds');
      const running = yield* Fiber.join(call);
      assert.isFalse(running.isError);
      assert.deepStrictEqual(JSON.parse(running.text), {
        note: 'The subagent is still running. Call wait_subagent with this id to get its result.',
        status: 'running',
        subagentId: CHILD,
      });

      const stillWaiting = yield* Effect.forkChild(h.call('wait_subagent', { ids: [CHILD], timeoutMs: 1000 }));
      yield* until(() => true);
      yield* TestClock.adjust('1 second');
      assert.deepStrictEqual(yield* Fiber.join(stillWaiting), {
        isError: false,
        text: `<subagent id="${CHILD}" status="running" />`,
      });

      yield* Deferred.succeed(release, null);
      const done = yield* h.call('wait_subagent', { ids: [CHILD] });
      assert.deepStrictEqual(done, {
        isError: false,
        text: `<subagent id="${CHILD}" status="completed">\nlate result\n</subagent>`,
      });
      // Retained: a second wait still returns it.
      assert.strictEqual((yield* h.call('wait_subagent', { ids: [CHILD] })).text, done.text);
    }).pipe(Effect.scoped),
  );

  it.effect('a child finishing after the bound without wait_subagent is reported to the parent', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const parentPrompts: string[] = [];
      const h = yield* setup(
        {
          duringPrompt: Effect.andThen(
            Deferred.await(release),
            Effect.sync(() => {
              h.childFold.onSessionUpdate(CHILD, answer('late result'));
            }),
          ),
        },
        { promptTexts: parentPrompts },
      );
      const call = yield* Effect.forkChild(h.spawn());
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));
      yield* TestClock.adjust('240 seconds');
      assert.strictEqual(JSON.parse((yield* Fiber.join(call)).text).status, 'running');

      yield* Deferred.succeed(release, null);
      yield* until(() => parentPrompts.length > 0);
      assert.include(parentPrompts[0], 'late result');
    }).pipe(Effect.scoped),
  );

  it.effect('a child collected by wait_subagent after the bound is not also reported', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const parentPrompts: string[] = [];
      const h = yield* setup(
        {
          duringPrompt: Effect.andThen(
            Deferred.await(release),
            Effect.sync(() => {
              h.childFold.onSessionUpdate(CHILD, answer('late result'));
            }),
          ),
        },
        { promptTexts: parentPrompts },
      );
      const call = yield* Effect.forkChild(h.spawn());
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));
      yield* TestClock.adjust('240 seconds');
      yield* Fiber.join(call);
      // Busy parent: a report would wait for the turn end, so the wait gets there first.
      h.setParent({ pendingClientRequest: 'prompt' });
      const waiting = yield* Effect.forkChild(h.call('wait_subagent', { ids: [CHILD] }));
      yield* Deferred.succeed(release, null);
      assert.include((yield* Fiber.join(waiting)).text, 'late result');
      h.setParent({ pendingClientRequest: undefined });
      for (let i = 0; i < 30; i += 1) {
        yield* Effect.yieldNow;
      }
      assert.deepStrictEqual(parentPrompts, []);
    }).pipe(Effect.scoped),
  );

  it.effect('wait_subagent after the report went out still answers, and the report is not sent twice', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const parentPrompts: string[] = [];
      const h = yield* setup(
        {
          duringPrompt: Effect.andThen(
            Deferred.await(release),
            Effect.sync(() => {
              h.childFold.onSessionUpdate(CHILD, answer('late result'));
            }),
          ),
        },
        { promptTexts: parentPrompts },
      );
      const call = yield* Effect.forkChild(h.spawn());
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));
      yield* TestClock.adjust('240 seconds');
      yield* Fiber.join(call);
      yield* Deferred.succeed(release, null);
      yield* until(() => parentPrompts.length > 0);
      const waited = yield* h.call('wait_subagent', { ids: [CHILD] });
      assert.deepStrictEqual(waited, {
        isError: false,
        text: `<subagent id="${CHILD}" status="completed">\nlate result\n</subagent>`,
      });
      for (let i = 0; i < 30; i += 1) {
        yield* Effect.yieldNow;
      }
      const [link] = allLinks(h.registry);
      assert.strictEqual(link.handleState, 'reported');
      assert.strictEqual(parentPrompts.length, 1);
    }).pipe(Effect.scoped),
  );

  it.effect('wait_subagent refuses an id that is not the caller own child', () =>
    Effect.gen(function* () {
      const h = yield* setup();
      const result = yield* h.call('wait_subagent', { ids: ['someone-elses'] });
      assert.deepStrictEqual(result, { isError: true, text: 'You have no subagent with id "someone-elses".' });
    }).pipe(Effect.scoped),
  );

  it.effect('a handler interrupted mid-call (hub connection lost) does not stop the child', () =>
    Effect.gen(function* () {
      const release = Deferred.makeUnsafe<null>();
      const h = yield* setup({
        duringPrompt: Effect.andThen(
          Deferred.await(release),
          Effect.sync(() => {
            h.childFold.onSessionUpdate(CHILD, answer('kept going'));
          }),
        ),
      });
      const call = yield* Effect.forkChild(h.spawn());
      yield* until(() => h.childCalls.includes(`prompt:${CHILD}`));

      yield* Fiber.interrupt(call);
      yield* Deferred.succeed(release, null);
      const [link] = allLinks(h.registry);
      assert.deepStrictEqual(yield* Deferred.await(link.outcome), { status: 'completed', text: 'kept going' });
      const mirror = getSubagent(h.registry.get(backendHarnessSnapshotAtom(CODEX)).subagents, CHILD);
      assert.strictEqual(mirror?.state?.state, 'completed');
    }).pipe(Effect.scoped),
  );
});
