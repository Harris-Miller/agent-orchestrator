import { Effect, Stdio, Stream } from 'effect';
import { Ndjson } from 'effect/unstable/encoding';

export const lines = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio;
  return stdio.stdin.pipe(Stream.pipeThroughChannel(Ndjson.decode({ ignoreEmptyLines: true })));
});

export const writeMessage = Effect.fn('writeMessage')(function* (message: unknown) {
  const stdio = yield* Stdio.Stdio;
  yield* Stream.make(`${JSON.stringify(message)}\n`).pipe(Stream.run(stdio.stdout({ endOnDone: false })));
});
