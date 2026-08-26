import { NodeChildProcessSpawner, NodeFileSystem } from '@effect/platform-node';
import { Console, Effect, Layer, Path, Stream } from 'effect';
import { ChildProcess } from 'effect/unstable/process';

const textDecoder = new TextDecoder();

const program = Effect.gen(function* () {
  const c = yield* Console.Console;

  const handle = yield* ChildProcess.make('echo', ['hello, world!']);
  const stdout = handle.stdout.pipe(
    Stream.map(a => {
      const t = textDecoder.decode(a);
      console.log('stdout chunk:', t);
      return t;
    }),
  );
  const result = yield* Stream.runCollect(stdout);

  c.log(result);
}).pipe(
  Effect.catch(() => Effect.void),
  Effect.scoped,
  Effect.provide(NodeChildProcessSpawner.layer.pipe(Layer.provide(Layer.mergeAll(NodeFileSystem.layer, Path.layer)))),
);

await Effect.runPromise(program);
