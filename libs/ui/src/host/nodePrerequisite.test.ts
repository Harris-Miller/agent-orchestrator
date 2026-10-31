import { assert, describe, it } from '@effect/vitest';
import { Effect, Fiber, Layer, Sink, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/process';

import { checkNodePrerequisite, isNodePrerequisiteMet } from './nodePrerequisite.ts';

type Probe = { readonly exitCode: number; readonly stdout: string } | 'missing' | 'spawn-error' | 'hang';

const spawner = (probes: Record<string, Probe>) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(command => {
      const name = (command as unknown as { readonly command: string }).command;
      const probe = probes[name] ?? 'missing';
      if (probe === 'missing' || probe === 'spawn-error') {
        return Effect.fail(
          PlatformError.systemError({
            _tag: probe === 'missing' ? 'NotFound' : 'Unknown',
            description: probe === 'missing' ? 'not found' : 'boom',
            method: 'spawn',
            module: 'ChildProcess',
          }),
        );
      }
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: probe === 'hang' ? Effect.never : Effect.succeed(ChildProcessSpawner.ExitCode(probe.exitCode)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode(probe === 'hang' ? '' : probe.stdout)),
          unref: Effect.succeed(Effect.void),
        }),
      );
    }),
  );

const check = (probes: Record<string, Probe>) => checkNodePrerequisite().pipe(Effect.provide(spawner(probes)));

describe('checkNodePrerequisite', () => {
  it.effect('passes with node >= 22 and npm present, retaining both versions', () =>
    Effect.gen(function* () {
      const result = yield* check({
        node: { exitCode: 0, stdout: 'v22.3.0\n' },
        npm: { exitCode: 0, stdout: '10.8.1\n' },
      });
      assert.isTrue(isNodePrerequisiteMet(result));
      assert.deepStrictEqual(result.node, { _tag: 'Ok', version: '22.3.0' });
      assert.deepStrictEqual(result.npm, { _tag: 'Ok', version: '10.8.1' });
    }),
  );

  it.effect('distinguishes too-old node, missing npm, invalid output, non-zero exit and spawn failure', () =>
    Effect.gen(function* () {
      const old = yield* check({ node: { exitCode: 0, stdout: 'v20.11.0' }, npm: { exitCode: 0, stdout: '10.0.0' } });
      assert.isFalse(isNodePrerequisiteMet(old));
      assert.deepStrictEqual(old.node, { _tag: 'TooOld', version: '20.11.0' });

      const noNpm = yield* check({ node: { exitCode: 0, stdout: 'v22.0.0' } });
      assert.isFalse(isNodePrerequisiteMet(noNpm));
      assert.deepStrictEqual(noNpm.npm, { _tag: 'Missing' });

      const garbage = yield* check({ node: { exitCode: 0, stdout: 'hello' }, npm: { exitCode: 3, stdout: '' } });
      assert.deepStrictEqual(garbage.node, { _tag: 'InvalidOutput', output: 'hello' });
      assert.deepStrictEqual(garbage.npm, { _tag: 'NonZeroExit', exitCode: 3 });

      const broken = yield* check({ node: 'spawn-error', npm: { exitCode: 0, stdout: '10.0.0' } });
      assert.strictEqual(broken.node._tag, 'CheckFailed');
    }),
  );

  it.effect('a hung probe times out instead of blocking bootstrap', () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(check({ node: 'hang', npm: { exitCode: 0, stdout: '10.0.0' } }));
      yield* TestClock.adjust('11 seconds');
      const result = yield* Fiber.join(fiber);
      assert.deepStrictEqual(result.node, { _tag: 'TimedOut' });
      assert.isFalse(isNodePrerequisiteMet(result));
    }),
  );
});
