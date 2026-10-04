import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Fiber, Stream } from 'effect';

import { mapSpawnError, openQueuedChildProcessStdio } from './openQueuedChildProcessStdio.ts';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('mapSpawnError', () => {
  it('maps Error message into PlatformError description', () => {
    const error = mapSpawnError('spawn', new Error('boom'));
    assert.strictEqual(error.reason._tag, 'Unknown');
    assert.strictEqual(error.reason.method, 'spawn');
    assert.strictEqual(error.reason.description, 'boom');
  });
});

describe('openQueuedChildProcessStdio', () => {
  it.effect('stdout runCollect completes after StdoutEnd + Exit', () =>
    Effect.gen(function* () {
      const listed = yield* Effect.scoped(
        Effect.gen(function* () {
          const stdio = yield* openQueuedChildProcessStdio();
          const handle = yield* stdio.finalize({
            kill: Effect.void,
            pid: 42,
            writeStdin: () => Effect.void,
          });

          const fiber = yield* Effect.forkChild(
            Effect.all([handle.stdout.pipe(Stream.decodeText(), Stream.runCollect), handle.exitCode], {
              concurrency: 2,
            }),
          );
          yield* Effect.yieldNow;
          stdio.onStdoutChunk(encode('a\0b\0'));
          stdio.onStdoutEnd();
          stdio.onExit(0);
          const [chunks, exitCode] = yield* Fiber.join(fiber);
          return { exitCode, stdout: [...chunks].join('') } as const;
        }),
      );

      assert.strictEqual(listed.exitCode, 0);
      assert.strictEqual(listed.stdout, 'a\0b\0');
    }),
  );

  it.effect('stdout stream completes when Exit ends queues without StdoutEnd', () =>
    Effect.gen(function* () {
      const stdout = yield* Effect.scoped(
        Effect.gen(function* () {
          const stdio = yield* openQueuedChildProcessStdio();
          const handle = yield* stdio.finalize({
            kill: Effect.void,
            pid: 7,
            writeStdin: () => Effect.void,
          });

          const fiber = yield* Effect.forkChild(handle.stdout.pipe(Stream.decodeText(), Stream.mkString));
          yield* Effect.yieldNow;
          stdio.onStdoutChunk(encode('hello\n'));
          stdio.onExit(0);
          return yield* Fiber.join(fiber);
        }),
      );

      assert.strictEqual(stdout, 'hello\n');
    }),
  );

  it.effect('stdin writeStdin receives chunks', () =>
    Effect.gen(function* () {
      const writes: Uint8Array[] = [];
      yield* Effect.scoped(
        Effect.gen(function* () {
          const stdio = yield* openQueuedChildProcessStdio();
          const handle = yield* stdio.finalize({
            kill: Effect.void,
            pid: 99,
            writeStdin: chunk =>
              Effect.sync(() => {
                writes.push(chunk);
              }),
          });
          yield* Stream.run(Stream.make(encode('ping')), handle.stdin);
          stdio.onExit(0);
          yield* handle.exitCode;
        }),
      );
      assert.deepStrictEqual([...writes[0]], [...encode('ping')]);
    }),
  );

  it.effect('kill invokes finalize kill and clears isRunning', () =>
    Effect.gen(function* () {
      let killed = false;
      yield* Effect.scoped(
        Effect.gen(function* () {
          const stdio = yield* openQueuedChildProcessStdio();
          const handle = yield* stdio.finalize({
            kill: Effect.sync(() => {
              killed = true;
            }),
            pid: 1,
            writeStdin: () => Effect.void,
          });
          assert.isTrue(yield* handle.isRunning);
          yield* handle.kill();
          assert.isFalse(yield* handle.isRunning);
          stdio.onExit(0);
          yield* handle.exitCode;
        }),
      );
      assert.isTrue(killed);
    }),
  );

  it.effect('onSpawnError fails exitCode', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.scoped(
        Effect.gen(function* () {
          const stdio = yield* openQueuedChildProcessStdio();
          const handle = yield* stdio.finalize({
            kill: Effect.void,
            pid: 3,
            writeStdin: () => Effect.void,
          });
          stdio.onSpawnError(new Error('spawn blew up'));
          return yield* Effect.exit(handle.exitCode);
        }),
      );
      assert.isTrue(Exit.isFailure(exit));
    }),
  );

  it.effect('stderr inherit drains without chunks and completes on Exit', () =>
    Effect.gen(function* () {
      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          const stdio = yield* openQueuedChildProcessStdio({ stderrMode: 'inherit' });
          const handle = yield* stdio.finalize({
            kill: Effect.void,
            pid: 5,
            writeStdin: () => Effect.void,
          });
          const fiber = yield* Effect.forkChild(
            Effect.all([handle.stderr.pipe(Stream.runCollect), handle.exitCode], { concurrency: 2 }),
          );
          yield* Effect.yieldNow;
          stdio.onExit(0);
          const [stderrChunks, exitCode] = yield* Fiber.join(fiber);
          return { exitCode, stderrCount: stderrChunks.length } as const;
        }),
      );
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(result.stderrCount, 0);
    }),
  );
});
