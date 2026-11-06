import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import { vi } from 'vitest';

import type { AcpBootstrapPhase } from './acpSessionBootstrap.ts';
import type { BackendHarnessCallbacks } from './backendHarness.ts';

const control = vi.hoisted(() => ({
  listGate: undefined as unknown,
  probe: undefined as unknown,
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
  runConfigProbe: () => control.probe,
}));

const { runBackendHarness } = await import('./backendHarness.ts');

const makeHandlers = (events: string[]): BackendHarnessCallbacks => ({
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

describe('runBackendHarness', () => {
  it.effect('reaches usable before session/list and the probe resolve, ready after both', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const listGate = yield* Deferred.make<{ sessions: unknown[] }>();
      const probeGate = yield* Deferred.make<{ models: unknown[] }>();
      control.listGate = Deferred.await(listGate);
      control.probe = Deferred.await(probeGate);

      const fiber = yield* Effect.forkChild(
        Effect.scoped(runBackendHarness('claude-agent-acp', makeHandlers(events), () => scope)) as Effect.Effect<void>,
      );
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.include(events, 'usable');
      assert.notInclude(events, 'ready');

      yield* Deferred.succeed(listGate, { sessions: [] });
      yield* Deferred.succeed(probeGate, { models: [] });
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.isBelow(events.indexOf('usable'), events.indexOf('history'));
      assert.isBelow(events.indexOf('history'), events.indexOf('ready'));
      assert.isBelow(events.indexOf('index'), events.indexOf('ready'));
      yield* Fiber.interrupt(fiber);
    }),
  );

  it.effect('a probe failure after usable still ends in error', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      control.listGate = Effect.never;
      control.probe = Effect.fail(new Error('probe boom'));

      const fiber = yield* Effect.forkChild(
        Effect.scoped(runBackendHarness('claude-agent-acp', makeHandlers(events), () => scope)) as Effect.Effect<void>,
      );
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      assert.include(events, 'usable');
      assert.include(events, 'error');
      assert.notInclude(events, 'ready');
      yield* Fiber.interrupt(fiber);
    }),
  );
});
