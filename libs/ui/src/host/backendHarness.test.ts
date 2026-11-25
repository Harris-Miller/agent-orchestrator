import { assert, describe, it } from '@effect/vitest';
import { EditorFilesLive } from '@lib/context-services-tauri';
import { Deferred, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import { vi } from 'vitest';

import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { BackendHarnessCallbacks } from './backendHarness.ts';
import { listSessionsPayload } from './sessionListScope.ts';
import { BackendNotConnected, createSession, listSessionsPage } from './sessionRpc.ts';

const control = vi.hoisted(() => ({
  initializeResult: {} as unknown,
  listGate: undefined as unknown,
  probe: undefined as unknown,
  newRequests: [] as unknown[],
  probeCalls: 0,
}));

vi.mock('@lib/effect-acp', async importOriginal => ({
  ...(await importOriginal<object>()),
  connectAcpAgent: () =>
    Effect.succeed({
      agent: {
        initialize: () => Effect.succeed(control.initializeResult),
        'session/list': () => control.listGate,
        'session/new': (params: unknown) => {
          control.newRequests.push(params);
          return Effect.succeed({ sessionId: 'new-1' });
        },
      },
      notify: () => Effect.void,
      sessionArchive: () => Effect.void,
      sessionFork: () => Effect.void,
      sessionRename: () => Effect.void,
      sessionSteering: () => Effect.void,
      sessionUnarchive: () => Effect.void,
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
  onSessionUpdate: () => undefined,
});

const LT = 'claude-agent-acp' as const;
const listPayload = listSessionsPayload(LT, '/w');

const run = (events: string[], cached: boolean) =>
  Effect.forkChild(
    Effect.scoped(runBackendHarness(LT, makeHandlers(events, cached))).pipe(
      Effect.provide(EditorFilesLive),
    ) as Effect.Effect<void>,
  );

describe('runBackendHarness', () => {
  it.effect('with a cached index: usable immediately, no probe, ready, and never lists sessions', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      let lists = 0;
      control.listGate = Effect.suspend(() => {
        lists += 1;
        return Effect.succeed({ sessions: [] });
      });
      control.probeCalls = 0;

      const fiber = yield* run(events, true);
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.include(events, 'usable');
      assert.include(events, 'ready');
      assert.strictEqual(lists, 0);
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
        yield* listSessionsPage(LT, listPayload, undefined);

        yield* Fiber.interrupt(fiber);
        assert.deepStrictEqual(
          events.filter(event => event === 'lost' || event === 'error'),
          ['lost'],
        );
        const error = yield* Effect.flip(listSessionsPage(LT, listPayload, undefined));
        assert.instanceOf(error, BackendNotConnected);
      }),
  );

  it.effect('retries exhausted leaves no connection registered', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      control.probe = Effect.fail(new Error('probe boom'));

      const fiber = yield* run(events, false);
      yield* TestClock.adjust('1 second');
      yield* TestClock.adjust('1 second');
      yield* Fiber.await(fiber);
      assert.strictEqual(events.filter(event => event === 'error').length, 3);
      const error = yield* Effect.flip(listSessionsPage(LT, listPayload, undefined));
      assert.instanceOf(error, BackendNotConnected);
    }),
  );

  const newRequestAfterInitialize = (initializeResult: unknown) =>
    Effect.gen(function* () {
      const events: string[] = [];
      control.initializeResult = initializeResult;
      control.newRequests = [];
      control.listGate = Effect.never;
      const fiber = yield* run(events, true);
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.include(events, 'initialized');
      yield* createSession(LT, '/w', { additionalDirectories: ['/lib/a'] });
      yield* Fiber.interrupt(fiber);
      control.initializeResult = {};
      return control.newRequests[0] as Record<string, unknown>;
    });

  it.effect('an initialize result advertising sessionCapabilities.additionalDirectories puts them on session/new', () =>
    Effect.gen(function* () {
      const request = yield* newRequestAfterInitialize({
        agentCapabilities: { sessionCapabilities: { additionalDirectories: {} } },
      });
      assert.deepStrictEqual(request.additionalDirectories, ['/lib/a']);
    }),
  );

  it.effect('an initialize result without it leaves the key off session/new', () =>
    Effect.gen(function* () {
      const request = yield* newRequestAfterInitialize({ agentCapabilities: {} });
      assert.isFalse('additionalDirectories' in request);
    }),
  );
});
