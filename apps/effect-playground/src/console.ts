import { Console, Effect } from 'effect';

const program = Effect.gen(function* () {
  const c = yield* Console.Console;
  c.log('hello, world!');
});

Effect.runSync(program);
