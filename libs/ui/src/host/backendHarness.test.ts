import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import { vi } from 'vitest';

import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { BackendHarnessCallbacks } from './backendHarness.ts';
import { listSessionsPayload } from './sessionListScope.ts';
import { BackendNotConnected, listSessions } from './sessionRpc.ts';

const control = vi.hoisted(() => ({
  listGate: undefined as unknown,
  probe: undefined as unknown,
  probeCalls: 0,
}));

vi.mock('@libs/effect-acp', async importOriginal => ({
  ...(await importOriginal<object>()),
  connectAcpAgent: () =>
    Effect.succeed({
      agent: {
        initialize: () => Effect.succeed({}),
        'session/list': () => control.listGate,
      },
      notify: () => Effect.void,
      sessionArchive: () => Effect.void,
      sessionFork: () => Effect.void,
      sessionRename: () => Effect.void,
      sessionSteering: () => Effect.void,
      handle: { pid: 1, stderr: undefined },
    }),
}));
vi.mock('./acpLaunchCommand.ts', () => ({ makeAcpLaunchCommand: () => Effect.succeed({}) }));
vi.mock('./configProbe.ts', async importOriginal => ({
  ...(await importOriginal<object>()),
  runConfigProbe: () => {
    control.probeCalls += 1;
    return control.probe;
  },
}));

const { runBackendHarness } = await import('./backendHarness.ts');

const makeHandlers = (events: string[], cached: boolean): BackendHarnessCallbacks => ({
  hasConfigOptionIndex: () => cached,
  onConfigIndexEvent: () => undefined,
  onConfigOptionIndexPublish: () => {
    events.push('index');
  },
  onConnectionLost: () => {
    events.push('lost');
  },
  onElicitationCreate: () => undefined,
  onInitializeResult: () => undefined,
  onPermissionRequest: () => undefined,
  onPhase: (phase: AcpBootstrapPhase) => {
    events.push(phase);
  },
  onRpcMessage: () => undefined,
  onSessionHistoryRequest: () => undefined,
  onSessionHistoryResult: () => {
    events.push('history');
  },
  onSessionUpdate: () => undefined,
});

const scope = { _tag: 'Unscoped' } as const;
const LT = 'claude-agent-acp' as const;
const listPayload = listSessionsPayload(scope)!;

const run = (events: string[], cached: boolean) =>
  Effect.forkChild(
    Effect.scoped(runBackendHarness(LT, makeHandlers(events, cached), () => scope)) as Effect.Effect<void>,
  );

describe('runBackendHarness', () => {
  it.effect('with a cached index: usable immediately, no probe, ready after session/list', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const listGate = yield* Deferred.make<{ sessions: unknown[] }>();
      control.listGate = Deferred.await(listGate);
      control.probeCalls = 0;

      const fiber = yield* run(events, true);
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.include(events, 'usable');
      assert.notInclude(events, 'ready');

      yield* Deferred.succeed(listGate, { sessions: [] });
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.isBelow(events.indexOf('history'), events.indexOf('ready'));
      assert.strictEqual(control.probeCalls, 0);
      assert.notInclude(events, 'index');
      yield* Fiber.interrupt(fiber);
    }),
  );

  it.effect('without a cached index: probe publishes before usable', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const probeGate = yield* Deferred.make<{ models: unknown[] }>();
      control.listGate = Effect.never;
      control.probe = Deferred.await(probeGate);
      control.probeCalls = 0;

      const fiber = yield* run(events, false);
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.notInclude(events, 'usable');

      yield* Deferred.succeed(probeGate, { models: [] });
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.isBelow(events.indexOf('index'), events.indexOf('usable'));
      assert.strictEqual(control.probeCalls, 1);
      yield* Fiber.interrupt(fiber);
    }),
  );

  it.effect('a cold probe that always fails never reaches usable and exhausts retries', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      control.listGate = Effect.never;
      control.probe = Effect.fail(new Error('probe boom'));

      const fiber = yield* run(events, false);
      yield* TestClock.adjust('1 second');
      yield* TestClock.adjust('1 second');
      yield* TestClock.adjust('1 second');
      yield* Fiber.await(fiber);
      assert.deepStrictEqual(
        events.filter(event => event === 'lost' || event === 'error'),
        ['lost', 'error', 'lost', 'error', 'lost', 'error'],
      );
      assert.notInclude(events, 'usable');
    }),
  );

  it.effect('a session/list failure after usable reports Connection lost before the error, then reconnects', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      let lists = 0;
      control.listGate = Effect.suspend(() => {
        lists += 1;
        return lists === 1 ? Effect.fail(new Error('list boom')) : Effect.never;
      });

      const fiber = yield* run(events, true);
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.deepStrictEqual(events, ['connecting', 'initialized', 'usable', 'lost', 'error']);

      yield* TestClock.adjust('1 second');
      assert.deepStrictEqual(events.slice(5, 8), ['connecting', 'initialized', 'usable']);
      yield* Fiber.interrupt(fiber);
    }),
  );

  it.effect(
    'interrupting a ready harness (Stop) reports Connection lost exactly once and unregisters the connection',
    () =>
      Effect.gen(function* () {
        const events: string[] = [];
        control.listGate = Effect.succeed({ sessions: [] });

        const fiber = yield* run(events, true);
        yield* Effect.yieldNow;
        yield* Effect.yieldNow;
        assert.include(events, 'ready');
        assert.deepStrictEqual(yield* listSessions(LT, listPayload), { sessions: [] });

        yield* Fiber.interrupt(fiber);
        assert.deepStrictEqual(
          events.filter(event => event === 'lost' || event === 'error'),
          ['lost'],
        );
        const error = yield* Effect.flip(listSessions(LT, listPayload));
        assert.instanceOf(error, BackendNotConnected);
      }),
  );

  it.effect('retries exhausted leaves no connection registered', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      control.listGate = Effect.fail(new Error('list boom'));

      const fiber = yield* run(events, true);
      yield* TestClock.adjust('1 second');
      yield* TestClock.adjust('1 second');
      yield* Fiber.await(fiber);
      assert.strictEqual(events.filter(event => event === 'error').length, 3);
      const error = yield* Effect.flip(listSessions(LT, listPayload));
      assert.instanceOf(error, BackendNotConnected);
    }),
  );
});
