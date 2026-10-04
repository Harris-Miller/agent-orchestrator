import { assert, describe, it } from '@effect/vitest';
import { Effect, Ref } from 'effect';

import { makeForwardClientHandlerMap } from './forwardClientHandlers.ts';

describe('makeForwardClientHandlerMap', () => {
  it.effect('forwards session/update to the parent client', () =>
    Effect.gen(function* () {
      const seen = yield* Ref.make<unknown[]>([]);
      const parent = {
        'elicitation/complete': () => Effect.void,
        'elicitation/create': () => Effect.succeed({ action: 'cancel' as const }),
        'fs/read_text_file': () => Effect.succeed({ content: '' }),
        'fs/write_text_file': () => Effect.succeed({}),
        'session/request_permission': () => Effect.succeed({ outcome: { outcome: 'cancelled' as const } }),
        'session/update': (payload: unknown) => Ref.update(seen, s => [...s, payload]),
        'terminal/create': () => Effect.succeed({ terminalId: 't' }),
        'terminal/kill': () => Effect.succeed({}),
        'terminal/output': () => Effect.succeed({ output: '', truncated: false }),
        'terminal/release': () => Effect.succeed({}),
        'terminal/wait_for_exit': () => Effect.succeed({ exitCode: 0, signal: null }),
      };

      const handlers = makeForwardClientHandlerMap(parent as never);
      const payload = {
        sessionId: 'sess-1',
        update: { content: { text: 'hi', type: 'text' }, sessionUpdate: 'agent_message_chunk' },
      };
      yield* handlers['session/update'](payload);

      assert.deepStrictEqual(yield* Ref.get(seen), [payload]);
    }),
  );
});
