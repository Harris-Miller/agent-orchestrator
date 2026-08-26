import { NodeServices } from '@effect/platform-node';
import { Console, Effect, Stream } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

const textDecoder = new TextDecoder();
textDecoder.decode();

const program = Effect.gen(function* () {
  const c = yield* Console.Console;
  const handle = yield* ChildProcess.make('echo', ['hello, world!']);
  const stdout = handle.stdout.pipe(Stream.map(a => textDecoder.decode(a)));
  const result = yield* Stream.runCollect(stdout);
  c.log(result);
})
  .pipe(Effect.catch(() => Effect.void))
  .pipe(Effect.scoped);

await Effect.runPromise(program.pipe(Effect.provide(NodeServices.layer)));
