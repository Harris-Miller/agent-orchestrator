import { BunRuntime, BunStdio } from '@effect/platform-bun';
import { Effect, Queue, Ref, Stdio, Stream } from 'effect';

import { handleLine } from './handler';

const program = Effect.gen(function* () {
  const queue = yield* Queue.unbounded<string>(); // raw lines, pre-parsed
  const initialized = yield* Ref.make(false);
  const stdio = yield* Stdio.Stdio;

  // Producer: never fails to process on bad lines
  yield* Effect.forkChild(
    stdio.stdin.pipe(
      Stream.decodeText({ encoding: 'utf-8' }),
      Stream.splitLines,
      Stream.runForEach(line => Queue.offer(queue, line)),
    ),
  );

  // Consumer: sequential
  yield* Effect.forkChild(
    Effect.forever(
      Effect.gen(function* () {
        const line = yield* Queue.take(queue);
        yield* handleLine(line, initialized);
      }),
    ),
  );

  return yield* Effect.never; // stay alive until interrupt
}).pipe(Effect.scoped, Effect.provide(BunStdio.layer));

BunRuntime.runMain(program, {
  disableErrorReporting: true, // avoid dumping Effect errors onto the console
});
