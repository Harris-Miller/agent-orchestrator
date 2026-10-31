import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect } from 'effect';

import { makeBackendLifecycle } from './backendLifecycle.ts';

/** Harness stand-in: acquire = "spawn", release = slow "kill + await exit". */
const fakeHarness = (log: { spawned: number; exited: number }, started?: Deferred.Deferred<undefined>) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      log.spawned += 1;
    }),
    () =>
      Effect.promise(
        () =>
          new Promise<void>(resolve => {
            setTimeout(() => {
              log.exited += 1;
              resolve();
            }, 30);
          }),
      ),
  ).pipe(
    Effect.andThen(started === undefined ? Effect.void : Deferred.succeed(started, undefined)),
    Effect.andThen(Effect.never),
    Effect.scoped,
  );

/** Wall clock: `it.effect` freezes `Effect.sleep` under TestClock. */
const wallSleep = (ms: number) =>
  Effect.promise(
    () =>
      new Promise<void>(resolve => {
        setTimeout(resolve, ms);
      }),
  );

describe('backend lifecycle', () => {
  it.effect('start is idempotent and stop returns only after the process has exited', () =>
    Effect.gen(function* () {
      const lifecycle = makeBackendLifecycle(effect => Effect.runFork(effect));
      const log = { exited: 0, spawned: 0 };
      const started = yield* Deferred.make<undefined>();

      assert.isTrue(lifecycle.start('claude-agent-acp', fakeHarness(log, started)));
      assert.isFalse(lifecycle.start('claude-agent-acp', fakeHarness(log)));
      yield* Deferred.await(started);
      assert.strictEqual(log.spawned, 1);
      assert.isTrue(lifecycle.isRunning('claude-agent-acp'));

      yield* lifecycle.stop('claude-agent-acp');
      assert.strictEqual(log.exited, 1);
      assert.isFalse(lifecycle.isRunning('claude-agent-acp'));
      // Nothing restarts it behind our back.
      yield* wallSleep(50);
      assert.strictEqual(log.spawned, 1);
    }),
  );

  it.effect('stop on a never-started target is a no-op, and a stopped target can be started explicitly again', () =>
    Effect.gen(function* () {
      const lifecycle = makeBackendLifecycle(effect => Effect.runFork(effect));
      const log = { exited: 0, spawned: 0 };
      yield* lifecycle.stop('codex-acp');

      const first = yield* Deferred.make<undefined>();
      lifecycle.start('codex-acp', fakeHarness(log, first));
      yield* Deferred.await(first);
      yield* lifecycle.stop('codex-acp');

      const second = yield* Deferred.make<undefined>();
      assert.isTrue(lifecycle.start('codex-acp', fakeHarness(log, second)));
      yield* Deferred.await(second);
      assert.strictEqual(log.spawned, 2);
      assert.strictEqual(log.exited, 1);
      yield* lifecycle.stop('codex-acp');
      assert.strictEqual(log.exited, 2);
    }),
  );

  it.effect('a harness that gives up frees its slot for an explicit restart', () =>
    Effect.gen(function* () {
      const lifecycle = makeBackendLifecycle(effect => Effect.runFork(effect));
      const done = yield* Deferred.make<undefined>();
      lifecycle.start('claude-agent-acp', Deferred.succeed(done, undefined).pipe(Effect.asVoid));
      yield* Deferred.await(done);
      yield* wallSleep(10);
      assert.isFalse(lifecycle.isRunning('claude-agent-acp'));
    }),
  );
});
