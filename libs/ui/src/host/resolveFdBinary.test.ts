import { assert, describe, it } from '@effect/vitest';
import { Effect, Layer, Option, Sink, Stream } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcessSpawner } from 'effect/unstable/process';

import { clearResolvedFdBinary, requireFdBinary, resolveFdBinary } from './resolveFdBinary.ts';

const spawnerLayer = (opts: {
  readonly exitByCommand: Readonly<Record<string, number>>;
  readonly failSpawn?: ReadonlySet<string>;
}) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(command => {
      const name = command._tag === 'StandardCommand' ? command.command : '';
      if (opts.failSpawn?.has(name) === true) {
        return Effect.fail(
          PlatformError.systemError({
            _tag: 'Unknown',
            description: `${name} not found`,
            method: 'spawn',
            module: 'ChildProcess',
          }),
        );
      }
      const code = opts.exitByCommand[name] ?? 1;
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(code)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.empty,
          unref: Effect.succeed(Effect.void),
        }),
      );
    }),
  );

describe('resolveFdBinary', () => {
  it.effect('resolves fd when --version exits 0', () =>
    Effect.gen(function* () {
      yield* clearResolvedFdBinary();
      const found = yield* resolveFdBinary();
      assert.isTrue(Option.isSome(found));
      assert.strictEqual(Option.getOrThrow(found), 'fd');
    }).pipe(Effect.provide(spawnerLayer({ exitByCommand: { fd: 0, fdfind: 1 } }))),
  );

  it.effect('falls back to fdfind', () =>
    Effect.gen(function* () {
      yield* clearResolvedFdBinary();
      const found = yield* resolveFdBinary();
      assert.isTrue(Option.isSome(found));
      assert.strictEqual(Option.getOrThrow(found), 'fdfind');
    }).pipe(Effect.provide(spawnerLayer({ exitByCommand: { fd: 1, fdfind: 0 } }))),
  );

  it.effect('returns none when spawn fails for both', () =>
    Effect.gen(function* () {
      yield* clearResolvedFdBinary();
      const found = yield* resolveFdBinary();
      assert.isTrue(Option.isNone(found));
    }).pipe(Effect.provide(spawnerLayer({ exitByCommand: {}, failSpawn: new Set(['fd', 'fdfind']) }))),
  );

  it.effect('requireFdBinary returns cached name', () =>
    Effect.gen(function* () {
      yield* clearResolvedFdBinary();
      yield* resolveFdBinary();
      const name = yield* requireFdBinary();
      assert.strictEqual(name, 'fd');
    }).pipe(Effect.provide(spawnerLayer({ exitByCommand: { fd: 0 } }))),
  );
});
