/** Provider restart wait: usable again, stopped by the user, or timed out (TestClock). */
import { assert, describe, it } from '@effect/vitest';
import { Duration, Effect, Exit, Fiber } from 'effect';
import { TestClock } from 'effect/testing';

import { createHostRuntime } from '../createHostRuntime.ts';
import { backendDesiredStateAtom, backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { CLAUDE, freshRegistry } from './fakeAgent.testing.ts';
import { awaitBackendUsable, BackendRestartFailed, createHarnessAtoms } from './harness.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { createUserSettingsAtoms } from './userSettings/userSettings.atoms.ts';

const failureOf = (exit: Exit.Exit<unknown, BackendRestartFailed>) => {
  assert.isTrue(Exit.isFailure(exit));
  const error = Exit.isFailure(exit) ? exit.cause.reasons.find(reason => reason._tag === 'Fail')?.error : undefined;
  assert.instanceOf(error, BackendRestartFailed);
  return error;
};

describe('awaitBackendUsable', () => {
  it.effect('resolves when the snapshot reaches a usable phase', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      const fiber = yield* Effect.forkChild(Effect.uninterruptible(awaitBackendUsable(registry, CLAUDE)));
      yield* Effect.yieldNow;
      updateHarnessSnapshot(registry, CLAUDE, current => ({ ...current, phase: 'usable' }));
      yield* Fiber.join(fiber);
    }).pipe(Effect.scoped),
  );

  it.effect('fails when the user stops the Provider meanwhile', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      const fiber = yield* Effect.forkChild(Effect.exit(Effect.uninterruptible(awaitBackendUsable(registry, CLAUDE))));
      yield* Effect.yieldNow;
      registry.set(backendDesiredStateAtom(CLAUDE), 'stopped');
      const error = failureOf(yield* Fiber.join(fiber));
      assert.strictEqual(error.reason, 'stopped while restarting');
    }).pipe(Effect.scoped),
  );

  it.effect('times out when the Provider never becomes usable', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      const fiber = yield* Effect.forkChild(Effect.exit(Effect.uninterruptible(awaitBackendUsable(registry, CLAUDE))));
      yield* Effect.yieldNow;
      yield* TestClock.adjust(Duration.minutes(2));
      const error = failureOf(yield* Fiber.join(fiber));
      assert.include(error.reason, 'timed out');
      assert.strictEqual(error.launchTarget, CLAUDE);
    }).pipe(Effect.scoped),
  );
});

describe('restartBackendAwaitingUsable', () => {
  it.effect('fails without starting when the user stopped the Provider', () =>
    Effect.gen(function* () {
      const runtime = createHostRuntime(mockHostLayer);
      const { restartBackendAwaitingUsable } = createHarnessAtoms(runtime, {
        setModelPickerPrefsAtom: createUserSettingsAtoms(runtime.atomRuntime).setModelPickerPrefsAtom,
      });
      const registry = yield* freshRegistry;
      registry.set(backendDesiredStateAtom(CLAUDE), 'stopped');
      const error = failureOf(yield* Effect.exit(restartBackendAwaitingUsable(CLAUDE, registry)));
      assert.strictEqual(error.reason, 'stopped by the user');
      assert.strictEqual(registry.get(backendDesiredStateAtom(CLAUDE)), 'stopped');
      assert.isFalse(['usable', 'ready'].includes(registry.get(backendHarnessSnapshotAtom(CLAUDE)).phase));
    }).pipe(Effect.scoped),
  );
});
