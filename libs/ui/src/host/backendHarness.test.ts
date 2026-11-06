import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import { vi } from 'vitest';

import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { BackendHarnessCallbacks } from './backendHarness.ts';

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
  onConfigOptionIndexPublish: () => {
    events.push('index');
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

const run = (events: string[], cached: boolean) =>
  Effect.forkChild(
    Effect.scoped(
      runBackendHarness('claude-agent-acp', makeHandlers(events, cached), () => scope),
    ) as Effect.Effect<void>,
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
      assert.strictEqual(events.filter(event => event === 'error').length, 3);
      assert.notInclude(events, 'usable');
    }),
  );
});
