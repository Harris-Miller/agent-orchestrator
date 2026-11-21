/**
 * Prompt turn: Send, Steering and Prompt turn cancel through the module's interface, against a real registry and the
 * fake ACP agent. TestClock drives turn timing and the Steer fallback's bound.
 */
import { assert, layer } from '@effect/vitest';
import { Notifier, OS } from '@lib/context-services';
import { Clock, Effect, Exit, Fiber, Layer, Option } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import type { AtomRegistry } from 'effect/reactivity';
import { TestClock } from 'effect/testing';

import type { SessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { NO_AGENT_CAPABILITIES } from '../host/agentCapabilities.ts';
import { subagent } from '../host/harnessSnapshot.testing.ts';
import { canContinueFailure, CONTINUE_PROMPT_TEXT } from '../host/sessionFailureRetry.ts';
import { dropSession, markSessionInactive } from '../host/harnessStateTransitions.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { CODEX, freshRegistry, gated, installFakeAgent, REJECTION, setPhase } from './fakeAgent.testing.ts';
import { HandoffError, handoffPrompt } from './handoff.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import {
  cancelPromptTurn,
  ComposerActionUnavailable,
  sendPromptTurn,
  SteeringRejected,
  steerPromptTurn,
} from './promptTurn.ts';

type Registry = AtomRegistry.AtomRegistry;
type Sent = { body: string; sound: boolean; title: string };

/** Notifications raised by the current test (reset by {@link harness}). */
const sent: Sent[] = [];

const hostLayer = Layer.mergeAll(
  Layer.succeed(Notifier, {
    isWindowFocused: Effect.succeed(false),
    playSound: Effect.void,
    notify: input => {
      sent.push({ ...input });
      return Effect.void;
    },
    supported: 'os',
  }),
  Layer.succeed(OS, {
    arch: () => 'arm64',
    cwd: () => '/h',
    env: () => ({}),
    homedir: () => '/h',
    platform: () => 'linux',
  }),
  layerNoop({ exists: () => Effect.succeed(false) }),
  posixPathLayer,
);

const steeringCapabilities = { ...NO_AGENT_CAPABILITIES, steeringSupported: true };

const pendingPermission = { request: {}, resolve: () => undefined } as unknown as SessionSnapshot['pendingPermission'];

/**
 * Fake agent + registry with Codex `ready`, Steering supported, and active Sessions `ids` titled `My chat`. `t0` is the
 * TestClock time at setup (the clock is shared by every test in a `layer` group).
 */
const harness = Effect.fnUntraced(function* (opts: FakeAgentOpts = {}, ids: readonly string[] = ['s1']) {
  sent.length = 0;
  const calls: string[] = [];
  yield* installFakeAgent(calls, opts);
  const registry = yield* freshRegistry;
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    agentCapabilities: steeringCapabilities,
    phase: 'ready',
    sessionHistory: ids.map(sessionId => ({ cwd: '/w', sessionId, title: 'My chat' })),
    sessions: Object.fromEntries(ids.map(id => [id, initialSessionSnapshot(id, 'active')])),
  }));
  return { calls, registry, t0: yield* Clock.currentTimeMillis };
});

const snapshotOf = (registry: Registry) => registry.get(backendHarnessSnapshotAtom(CODEX));

const sessionOf = (registry: Registry, sessionId = 's1') => snapshotOf(registry).sessions[sessionId];

const patch = (registry: Registry, sessionId: string, fields: Partial<SessionSnapshot>) => {
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessions: { ...current.sessions, [sessionId]: { ...current.sessions[sessionId], ...fields } },
  }));
};

const userMessages = (registry: Registry, sessionId = 's1') =>
  sessionId in snapshotOf(registry).sessions
    ? sessionOf(registry, sessionId).transcript.items.flatMap(item => (item.kind === 'user_message' ? [item] : []))
    : [];

const requestErrors = (registry: Registry, sessionId = 's1') =>
  sessionId in snapshotOf(registry).sessions
    ? sessionOf(registry, sessionId).transcript.items.flatMap(item => (item.kind === 'request_error' ? [item] : []))
    : [];

/** The Request error the fake Agent's {@link REJECTION} becomes in a transcript (id aside). */
const rejectionItem = (method: string) => ({
  code: REJECTION.code,
  details: REJECTION.data.details,
  kind: 'request_error' as const,
  message: REJECTION.message,
  method,
});

const stripId = <T extends { readonly id: string }>({ id: _id, ...rest }: T) => rest;

const send = (registry: Registry, text = 'hello', sessionId = 's1') =>
  sendPromptTurn(registry, { launchTarget: CODEX, sessionId, text });

const steer = (registry: Registry, text = 'hello') =>
  steerPromptTurn(registry, { launchTarget: CODEX, sessionId: 's1', text });

/** Let forked fibers (and the detached Attention notify) run to their next real wait. */
const settle = Effect.repeat(Effect.yieldNow, { times: 50 });

layer(hostLayer)('Send', layeredIt => {
  const refused = (name: string, seed: (registry: Registry) => void, text = 'hello') => {
    layeredIt.effect(`is refused, leaving the snapshot untouched, ${name}`, () =>
      Effect.gen(function* () {
        const h = yield* harness();
        seed(h.registry);
        const before = snapshotOf(h.registry);
        const error = yield* Effect.flip(send(h.registry, text));
        assert.instanceOf(error, ComposerActionUnavailable);
        assert.match(error.message, /Sending is not available/);
        assert.strictEqual(snapshotOf(h.registry), before);
        assert.deepStrictEqual(h.calls, []);
      }).pipe(Effect.scoped),
    );
  };

  refused('when the Session is missing', registry => {
    updateHarnessSnapshot(registry, CODEX, current => dropSession(current, 's1'));
  });
  refused('when the Session is not active', registry => {
    patch(registry, 's1', { status: 'inactive' });
  });
  refused('when the prompt is empty', () => undefined, '   ');
  refused('while a prompt is in flight', registry => {
    patch(registry, 's1', { pendingClientRequest: 'prompt' });
  });
  refused('while a config request is pending', registry => {
    patch(registry, 's1', { pendingClientRequest: 'config' });
  });
  refused('while a Pending interaction waits', registry => {
    patch(registry, 's1', { pendingPermission });
  });
  refused('when Bootstrap is not usable, even for an active Session', registry => {
    setPhase(registry, CODEX, 'initialized');
  });

  layeredIt.effect('a session failure in the prompt response is a row, deduped by id and revision', () =>
    Effect.gen(function* () {
      const failure = {
        actions: ['retry'],
        category: 'service',
        id: 'f1',
        revision: 1,
        severity: 'error',
        title: 'Down',
      };
      const h = yield* harness({ promptMeta: { jetbrains: { air: { sessionFailure: failure } } } });
      const result = yield* send(h.registry);
      assert.strictEqual(result._tag, 'Ended');
      const rows = () => sessionOf(h.registry).transcript.items.filter(item => item.kind === 'session_failure');
      assert.strictEqual(rows().length, 1);
      assert.isUndefined(sessionOf(h.registry).pendingClientRequest);
      yield* send(h.registry, 'again');
      assert.strictEqual(rows().length, 1);
    }),
  );

  const limitFailure = {
    actions: ['retry'],
    category: 'limit',
    id: 'f1',
    revision: 1,
    severity: 'error',
    title: 'Limit',
  };
  const continuable = (registry: Registry) => {
    const session = sessionOf(registry);
    return canContinueFailure(session, session.transcript.items, 'f1');
  };

  layeredIt.effect(
    'Continue after a limit failure sends one text block as a user message and ends continuability',
    () =>
      Effect.gen(function* () {
        const promptBlocks: { type: string; text?: string }[][] = [];
        const h = yield* harness({
          promptBlocks,
          promptMeta: { jetbrains: { air: { sessionFailure: limitFailure } } },
        });
        yield* send(h.registry, 'work');
        assert.isTrue(continuable(h.registry));
        promptBlocks.length = 0;
        const before = userMessages(h.registry).length;
        const result = yield* send(h.registry, CONTINUE_PROMPT_TEXT);
        assert.strictEqual(result._tag, 'Ended');
        assert.deepStrictEqual(promptBlocks, [[{ text: 'Continue where you left off.', type: 'text' }]]);
        const messages = userMessages(h.registry);
        assert.strictEqual(messages.length, before + 1);
        assert.strictEqual(messages.at(-1)?.text, 'Continue where you left off.');
        // The same limit failure (deduped by id/revision) now sits before the new user message.
        assert.isFalse(continuable(h.registry));
      }).pipe(Effect.scoped),
  );

  layeredIt.effect(
    'a Continue the Agent rejects after a limit failure shows the Request error and keeps the message',
    () =>
      Effect.gen(function* () {
        const opts: FakeAgentOpts = { promptMeta: { jetbrains: { air: { sessionFailure: limitFailure } } } };
        const h = yield* harness(opts);
        yield* send(h.registry, 'work');
        assert.isTrue(continuable(h.registry));
        Object.assign(opts, { prompt: 'reject' });
        const result = yield* send(h.registry, CONTINUE_PROMPT_TEXT);
        yield* settle;
        assert.deepStrictEqual(result, { _tag: 'Rejected', error: REJECTION });
        assert.deepStrictEqual(requestErrors(h.registry).map(stripId), [rejectionItem('session/prompt')]);
        assert.strictEqual(userMessages(h.registry).at(-1)?.text, 'Continue where you left off.');
      }).pipe(Effect.scoped),
  );

  layeredIt.effect('a turn records its timing and clears its request', () =>
    Effect.gen(function* () {
      const h = yield* harness({ duringPrompt: TestClock.adjust('3 seconds') });
      const result = yield* send(h.registry, '  hello ');

      assert.deepStrictEqual(result, { _tag: 'Ended', stopReason: 'end_turn' });
      assert.deepStrictEqual(h.calls, ['prompt:s1']);
      const [message] = userMessages(h.registry);
      assert.deepStrictEqual(userMessages(h.registry), [
        { endedAt: h.t0 + 3000, id: message.id, kind: 'user_message', startedAt: h.t0, text: 'hello' },
      ]);
      assert.isUndefined(sessionOf(h.registry).pendingClientRequest);
      assert.isUndefined(sessionOf(h.registry).promptCancelRequested);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('while in flight, the request is set and the message has only startedAt', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringPrompt: gate.during });
      const fiber = yield* Effect.forkChild(send(h.registry));
      yield* gate.started;

      assert.strictEqual(sessionOf(h.registry).pendingClientRequest, 'prompt');
      assert.strictEqual(userMessages(h.registry)[0].startedAt, h.t0);
      assert.isUndefined(userMessages(h.registry)[0].endedAt);

      yield* gate.release;
      yield* Fiber.join(fiber);
      assert.strictEqual(userMessages(h.registry)[0].endedAt, h.t0);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('an interrupted turn still ends: request cleared, endedAt stamped', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringPrompt: gate.during });
      const fiber = yield* Effect.forkChild(send(h.registry));
      yield* gate.started;
      yield* TestClock.adjust('2 seconds');
      yield* Fiber.interrupt(fiber);

      assert.isUndefined(sessionOf(h.registry).pendingClientRequest);
      assert.strictEqual(userMessages(h.registry)[0].endedAt, h.t0 + 2000);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('an RPC failure fails the turn; the message stays with both timestamps', () =>
    Effect.gen(function* () {
      const h = yield* harness({ prompt: 'fail' });
      const exit = yield* Effect.exit(send(h.registry));

      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(
        userMessages(h.registry).map(message => [message.text, message.startedAt, message.endedAt]),
        [['hello', h.t0, h.t0]],
      );
      assert.isUndefined(sessionOf(h.registry).pendingClientRequest);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a failure after Prompt turn cancel soft-succeeds as cancelled', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringPrompt: gate.during, prompt: 'fail' });
      const outcomes: unknown[] = [];
      const fiber = yield* Effect.forkChild(send(h.registry));
      yield* gate.started;
      const permission = {
        request: {},
        resolve: (outcome: unknown) => {
          outcomes.push(outcome);
        },
      } as unknown as SessionSnapshot['pendingPermission'];
      patch(h.registry, 's1', { pendingPermission: permission });

      yield* cancelPromptTurn(h.registry, { launchTarget: CODEX, sessionId: 's1' });
      assert.isTrue(sessionOf(h.registry).promptCancelRequested);
      assert.isUndefined(sessionOf(h.registry).pendingPermission);
      assert.deepStrictEqual(outcomes, [{ outcome: { outcome: 'cancelled' } }]);

      yield* gate.release;
      const result = yield* Fiber.join(fiber);
      assert.deepStrictEqual(result, { _tag: 'Ended', stopReason: 'cancelled' });
      assert.deepStrictEqual(h.calls, ['prompt:s1', 'cancel:s1']);
      assert.isUndefined(sessionOf(h.registry).promptCancelRequested);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a prompt the Agent rejects ends the turn and shows the Request error in the chat', () =>
    Effect.gen(function* () {
      const h = yield* harness({ prompt: 'reject' });
      const result = yield* send(h.registry);
      yield* settle;

      assert.deepStrictEqual(result, { _tag: 'Rejected', error: REJECTION });
      assert.deepStrictEqual(
        sessionOf(h.registry).transcript.items.map(item => item.kind),
        ['user_message', 'request_error'],
      );
      assert.deepStrictEqual(requestErrors(h.registry).map(stripId), [rejectionItem('session/prompt')]);
      assert.deepStrictEqual(
        userMessages(h.registry).map(message => [message.startedAt, message.endedAt]),
        [[h.t0, h.t0]],
      );
      assert.isUndefined(sessionOf(h.registry).pendingClientRequest);
      assert.deepStrictEqual(sent, []);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a rejection after Prompt turn cancel is still cancelled, with no Request error', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringPrompt: gate.during, prompt: 'reject' });
      const fiber = yield* Effect.forkChild(send(h.registry));
      yield* gate.started;
      yield* cancelPromptTurn(h.registry, { launchTarget: CODEX, sessionId: 's1' });
      yield* gate.release;

      assert.deepStrictEqual(yield* Fiber.join(fiber), { _tag: 'Ended', stopReason: 'cancelled' });
      assert.deepStrictEqual(requestErrors(h.registry), []);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a prompt rejected after the Session was dropped leaves it dropped', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringPrompt: gate.during, prompt: 'reject' });
      const fiber = yield* Effect.forkChild(send(h.registry));
      yield* gate.started;
      updateHarnessSnapshot(h.registry, CODEX, current => dropSession(current, 's1'));
      yield* gate.release;

      assert.strictEqual((yield* Fiber.join(fiber))._tag, 'Rejected');
      assert.isFalse('s1' in snapshotOf(h.registry).sessions);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a failure that is not an Agent response adds no Request error', () =>
    Effect.gen(function* () {
      const h = yield* harness({ prompt: 'fail' });
      yield* Effect.exit(send(h.registry));
      assert.deepStrictEqual(requestErrors(h.registry), []);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a turn that ends raises one Attention event with the chat title', () =>
    Effect.gen(function* () {
      const h = yield* harness();
      yield* send(h.registry);
      yield* settle;
      assert.deepStrictEqual(sent, [{ body: 'Finished', sound: false, title: 'My chat' }]);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a cancelled turn raises no Attention event', () =>
    Effect.gen(function* () {
      const h = yield* harness({ prompt: 'cancelled' });
      yield* send(h.registry);
      yield* settle;
      assert.deepStrictEqual(sent, []);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a failed turn raises no Attention event', () =>
    Effect.gen(function* () {
      const h = yield* harness({ prompt: 'fail' });
      yield* Effect.exit(send(h.registry));
      yield* settle;
      assert.deepStrictEqual(sent, []);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a Session dropped mid-turn stays dropped', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringPrompt: gate.during, prompt: 'fail' });
      const fiber = yield* Effect.forkChild(Effect.exit(send(h.registry)));
      yield* gate.started;
      updateHarnessSnapshot(h.registry, CODEX, current => dropSession(current, 's1'));
      yield* gate.release;
      const exit = yield* Fiber.join(fiber);

      assert.isFalse(Exit.hasDies(exit));
      assert.isFalse('s1' in snapshotOf(h.registry).sessions);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('of two concurrent Sends, exactly one starts a turn', () =>
    Effect.gen(function* () {
      const gate = yield* gated;
      const h = yield* harness({ duringPrompt: gate.during });
      const first = yield* Effect.forkChild(Effect.exit(send(h.registry, 'one')));
      const second = yield* Effect.forkChild(Effect.exit(send(h.registry, 'two')));
      yield* gate.started;
      yield* settle;
      yield* gate.release;
      const exits = [yield* Fiber.join(first), yield* Fiber.join(second)];

      assert.deepStrictEqual(h.calls, ['prompt:s1']);
      assert.strictEqual(userMessages(h.registry).length, 1);
      const refusals = exits.filter(exit => Exit.isFailure(exit));
      assert.strictEqual(refusals.length, 1);
      assert.instanceOf(Option.getOrUndefined(Exit.findErrorOption(refusals[0])), ComposerActionUnavailable);
    }).pipe(Effect.scoped),
  );
});

layer(hostLayer)('Steering', layeredIt => {
  const refused = (name: string, seed: (registry: Registry) => void, text = 'hello') => {
    layeredIt.effect(`is refused, appending nothing, ${name}`, () =>
      Effect.gen(function* () {
        const h = yield* harness();
        seed(h.registry);
        const error = yield* Effect.flip(steer(h.registry, text));
        assert.instanceOf(error, ComposerActionUnavailable);
        assert.match(error.message, /Steering is not available/);
        assert.deepStrictEqual(h.calls, []);
        assert.deepStrictEqual(userMessages(h.registry), []);
      }).pipe(Effect.scoped),
    );
  };

  refused('when no prompt is in flight', () => undefined);
  refused('when Prompt turn cancel was requested', registry => {
    patch(registry, 's1', { pendingClientRequest: 'prompt', promptCancelRequested: true });
  });
  refused(
    'when the draft is empty',
    registry => {
      patch(registry, 's1', { pendingClientRequest: 'prompt' });
    },
    '   ',
  );
  refused('when the Agent does not advertise Steering supported', registry => {
    patch(registry, 's1', { pendingClientRequest: 'prompt' });
    updateHarnessSnapshot(registry, CODEX, current => ({ ...current, agentCapabilities: NO_AGENT_CAPABILITIES }));
  });
  refused('while a Pending interaction waits', registry => {
    patch(registry, 's1', { pendingClientRequest: 'prompt', pendingPermission });
  });
  refused('while Bootstrap is not usable', registry => {
    patch(registry, 's1', { pendingClientRequest: 'prompt' });
    setPhase(registry, CODEX, 'connecting');
  });

  layeredIt.effect('an injected Steering message joins the turn without timing or touching the request', () =>
    Effect.gen(function* () {
      const h = yield* harness({ steering: 'injected' });
      patch(h.registry, 's1', { pendingClientRequest: 'prompt' });
      yield* steer(h.registry);

      assert.deepStrictEqual(h.calls, ['steer:s1']);
      const [message] = userMessages(h.registry);
      assert.deepStrictEqual(userMessages(h.registry), [
        { id: message.id, kind: 'user_message', steering: true, text: 'hello' },
      ]);
      assert.strictEqual(sessionOf(h.registry).pendingClientRequest, 'prompt');
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a Steering message the Agent rejects shows the Request error and is not injected', () =>
    Effect.gen(function* () {
      const h = yield* harness({ steering: 'reject' });
      patch(h.registry, 's1', { pendingClientRequest: 'prompt' });
      const error = yield* Effect.flip(steer(h.registry));

      assert.instanceOf(error, SteeringRejected);
      assert.deepStrictEqual(h.calls, ['steer:s1']);
      assert.deepStrictEqual(userMessages(h.registry), []);
      assert.deepStrictEqual(requestErrors(h.registry).map(stripId), [rejectionItem('_session/steering')]);
      assert.strictEqual(sessionOf(h.registry).pendingClientRequest, 'prompt');
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('promptRequired sends as soon as the ended turn clears its request, without polling', () =>
    Effect.gen(function* () {
      const h = yield* harness({ steering: 'promptRequired' });
      patch(h.registry, 's1', { pendingClientRequest: 'prompt' });
      const fiber = yield* Effect.forkChild(steer(h.registry));
      yield* settle;
      assert.deepStrictEqual(h.calls, ['steer:s1']);
      assert.deepStrictEqual(userMessages(h.registry), []);

      // The ended turn's response arrives; TestClock never moves, so a sleep-based poll would never fire.
      patch(h.registry, 's1', { pendingClientRequest: undefined });
      yield* settle;
      yield* Fiber.join(fiber);

      assert.deepStrictEqual(h.calls, ['steer:s1', 'prompt:s1']);
      assert.deepStrictEqual(
        userMessages(h.registry).map(message => [message.steering, message.startedAt, message.endedAt]),
        [[undefined, h.t0, h.t0]],
      );
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('promptRequired fails, appending nothing, when the ended turn never finishes', () =>
    Effect.gen(function* () {
      const h = yield* harness({ steering: 'promptRequired' });
      patch(h.registry, 's1', { pendingClientRequest: 'prompt' });
      const fiber = yield* Effect.forkChild(Effect.flip(steer(h.registry)));
      yield* settle;
      yield* TestClock.adjust('5 seconds');
      const error = yield* Fiber.join(fiber);

      assert.instanceOf(error, ComposerActionUnavailable);
      assert.deepStrictEqual(h.calls, ['steer:s1']);
      assert.deepStrictEqual(userMessages(h.registry), []);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('promptRequired fails without prompting when the Session goes inactive meanwhile', () =>
    Effect.gen(function* () {
      const h = yield* harness({ steering: 'promptRequired' });
      patch(h.registry, 's1', { pendingClientRequest: 'prompt' });
      const fiber = yield* Effect.forkChild(Effect.flip(steer(h.registry)));
      yield* settle;
      updateHarnessSnapshot(h.registry, CODEX, current => markSessionInactive(current, 's1'));
      const error = yield* Fiber.join(fiber);

      assert.instanceOf(error, ComposerActionUnavailable);
      assert.deepStrictEqual(h.calls, ['steer:s1']);
    }).pipe(Effect.scoped),
  );
});

layer(hostLayer)('Prompt turn cancel', layeredIt => {
  layeredIt.effect('does nothing on an idle Session', () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const before = snapshotOf(h.registry);
      yield* cancelPromptTurn(h.registry, { launchTarget: CODEX, sessionId: 's1' });
      assert.strictEqual(snapshotOf(h.registry), before);
      assert.deepStrictEqual(h.calls, []);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('cancels a Background follow-up with no turn: Pending interaction and agent, no soft-cancel', () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const outcomes: unknown[] = [];
      const permission = {
        request: {},
        resolve: (outcome: unknown) => {
          outcomes.push(outcome);
        },
      } as unknown as SessionSnapshot['pendingPermission'];
      patch(h.registry, 's1', { pendingPermission: permission });
      updateHarnessSnapshot(h.registry, CODEX, current => ({
        ...current,
        subagents: { c1: subagent('c1', 's1', { state: { state: 'running' } }) },
      }));

      yield* cancelPromptTurn(h.registry, { launchTarget: CODEX, sessionId: 's1' });
      assert.deepStrictEqual(outcomes, [{ outcome: { outcome: 'cancelled' } }]);
      assert.isUndefined(sessionOf(h.registry).pendingPermission);
      assert.isUndefined(sessionOf(h.registry).promptCancelRequested);
      assert.deepStrictEqual(h.calls, ['cancel:s1']);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('does nothing for a Session that is not in the map', () =>
    Effect.gen(function* () {
      const h = yield* harness();
      const before = snapshotOf(h.registry);
      yield* cancelPromptTurn(h.registry, { launchTarget: CODEX, sessionId: 'gone' });
      assert.strictEqual(snapshotOf(h.registry), before);
      assert.deepStrictEqual(h.calls, []);
    }).pipe(Effect.scoped),
  );
});

layer(hostLayer)('Handoff prompt', layeredIt => {
  layeredIt.effect('records the same transcript and timing as a Send', () =>
    Effect.gen(function* () {
      const h = yield* harness({ duringPrompt: TestClock.adjust('2 seconds') }, ['s1', 's2']);
      yield* send(h.registry, 'hand off', 's1');
      yield* handoffPrompt(h.registry, CODEX, 's2', 'hand off');

      const withoutId = (sessionId: string) => userMessages(h.registry, sessionId).map(({ id: _id, ...rest }) => rest);
      assert.deepStrictEqual(withoutId('s1'), [
        { endedAt: h.t0 + 2000, kind: 'user_message', startedAt: h.t0, text: 'hand off' },
      ]);
      assert.deepStrictEqual(withoutId('s2'), [
        { endedAt: h.t0 + 4000, kind: 'user_message', startedAt: h.t0 + 2000, text: 'hand off' },
      ]);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('never steers into an in-flight turn', () =>
    Effect.gen(function* () {
      const h = yield* harness();
      patch(h.registry, 's1', { pendingClientRequest: 'prompt' });
      const error = yield* Effect.flip(handoffPrompt(h.registry, CODEX, 's1', 'hand off'));

      assert.instanceOf(error, HandoffError);
      assert.deepStrictEqual(h.calls, []);
      assert.deepStrictEqual(userMessages(h.registry), []);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a refused prompt fails the Handoff with the Send refusal, appending nothing', () =>
    Effect.gen(function* () {
      const h = yield* harness();
      patch(h.registry, 's1', { status: 'inactive' });
      const error = yield* Effect.flip(handoffPrompt(h.registry, CODEX, 's1', 'hand off'));

      assert.instanceOf(error, HandoffError);
      assert.match(error.message, /Sending is not available.*NotActive/);
      assert.deepStrictEqual(userMessages(h.registry), []);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a cancelled turn fails the Handoff', () =>
    Effect.gen(function* () {
      const h = yield* harness({ prompt: 'cancelled' });
      const error = yield* Effect.flip(handoffPrompt(h.registry, CODEX, 's1', 'hand off'));

      assert.instanceOf(error, HandoffError);
      assert.match(error.message, /cancelled/);
    }).pipe(Effect.scoped),
  );

  layeredIt.effect('a prompt the Agent rejects fails the Handoff with its message, and shows it in that chat', () =>
    Effect.gen(function* () {
      const h = yield* harness({ prompt: 'reject' });
      const error = yield* Effect.flip(handoffPrompt(h.registry, CODEX, 's1', 'hand off'));

      assert.instanceOf(error, HandoffError);
      assert.match(error.message, /Exceeds max character length: Prompt is 120000 characters/);
      assert.deepStrictEqual(requestErrors(h.registry).map(stripId), [rejectionItem('session/prompt')]);
    }).pipe(Effect.scoped),
  );
});
