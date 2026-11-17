/** `spawn_subagent` and `wait_subagent` as an agent calls them: through `handleHubToolCall` with the caller's credential. */
import { assert, describe, it } from '@effect/vitest';
import type { HostServices } from '@lib/context-services';
import { Deferred, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';

import {
  advertise,
  bearerOf,
  CLAUDE,
  CODEX,
  enableProviders,
  freshRegistry,
  installFakeAgent,
  installFakeHub,
} from '../atoms/fakeAgent.testing.ts';
import type { FakeAgentOpts, McpReceived } from '../atoms/fakeAgent.testing.ts';
import { backendHarnessSnapshotAtom, configOptionIndexAtom } from '../atoms/backendState.atoms.ts';
import { makeHarnessEventFold } from '../atoms/harnessEventFold.ts';
import { updateHarnessSnapshot } from '../atoms/harnessSnapshot.ts';
import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';
import { endLink } from '../atoms/spawnedSubagent.ts';
import { spawnedLinksAtom } from '../atoms/subagentLinks.atoms.ts';

import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { configOptionIndexFromProbeResponses } from './configOptionIndexFixtures.ts';
import { handleHubToolCall } from './hubSessions.ts';
import { createSession } from './sessionRpc.ts';
import { getSubagent } from './subagent.ts';

const CHILD = 'claude-1';
const PARENT = 'bound-1';

const model = (id: string) => ({
  currentValue: id,
  id: 'model',
  name: 'Model',
  options: [
    { name: 'gpt', value: 'gpt' },
    { name: 'o1', value: 'o1' },
  ],
  type: 'select',
});

const childIndex = configOptionIndexFromProbeResponses('gpt', {
  gpt: { configOptions: [model('gpt')] },
  o1: { configOptions: [model('o1')] },
});

const answer = (value: string) => ({ content: { text: value, type: 'text' }, sessionUpdate: 'agent_message_chunk' });

/** A Codex parent holding a hub credential and a Claude child target, both with fake agents. */
const setup = Effect.fnUntraced(function* (childOpts: FakeAgentOpts = {}) {
  yield* installFakeHub([]);
  const registry = yield* freshRegistry;
  const received: McpReceived[] = [];
  yield* installFakeAgent([], { mcp: { received } });
  yield* createSession(CODEX, '/w');
  advertise(registry, CODEX, {});
  advertise(registry, CLAUDE, {});
  registry.set(configOptionIndexAtom(CLAUDE), childIndex);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [{ cwd: '/w', sessionId: PARENT, title: 'Parent' }],
    sessions: { [PARENT]: { ...initialSessionSnapshot(PARENT, 'active'), cwd: '/w' } },
  }));
  const childFold = makeHarnessEventFold({ launchTarget: CLAUDE, registry, runFork: () => undefined });
  const childCalls: string[] = [];
  yield* installFakeAgent(childCalls, { reports: childFold, ...childOpts }, CLAUDE);
  yield* Effect.addFinalizer(() =>
    Effect.forEach([...registry.get(spawnedLinksAtom).values()], link =>
      endLink(registry, { launchTarget: link.childLaunchTarget, sessionId: link.childSessionId }),
    ),
  );
  const token = bearerOf(received[0].servers);
  const call = (tool: string, args: unknown): Effect.Effect<{ isError: boolean; text: string }> =>
    (
      handleHubToolCall({ args, token, tool }, { registry }) as Effect.Effect<
        { isError: boolean; text: string },
        never,
        HostServices
      >
    ).pipe(Effect.provide(mockHostLayer));
  const spawn = (extra: Record<string, unknown> = {}) =>
    call('spawn_subagent', {
      configOptions: { model: 'o1' },
      description: 'Review',
      launchTarget: CLAUDE,
      task: 'Review the diff',
      ...extra,
    });
  const setParent = (patch: Partial<ReturnType<typeof initialSessionSnapshot>>) => {
    updateHarnessSnapshot(registry, CODEX, current => ({
      ...current,
      sessions: { ...current.sessions, [PARENT]: { ...current.sessions[PARENT], ...patch } },
    }));
  };
  return { call, childCalls, childFold, registry, setParent, spawn };
});

const until = (condition: () => boolean) =>
  Effect.yieldNow.pipe(Effect.repeat({ times: 200, until: () => condition() }), Effect.asVoid);

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
      const [link] = [...h.registry.get(spawnedLinksAtom).values()];
      assert.deepStrictEqual(yield* Deferred.await(link.outcome), { status: 'completed', text: 'kept going' });
      const mirror = getSubagent(h.registry.get(backendHarnessSnapshotAtom(CODEX)).subagents, CHILD);
      assert.strictEqual(mirror?.state?.state, 'completed');
    }).pipe(Effect.scoped),
  );
});
