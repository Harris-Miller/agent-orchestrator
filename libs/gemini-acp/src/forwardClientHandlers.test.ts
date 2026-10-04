import { assert, describe, layer } from '@effect/vitest';
import { mapFsTestServices } from '@lib/ao-home/testing';
import type { MapFsEntry } from '@lib/ao-home/testing';
import { Effect, Ref } from 'effect';
import { beforeEach } from 'vitest';

import { listRosterSessions, upsertRosterEntry } from './adapterRosterSessions.ts';
import { makeForwardClientHandlerMap } from './forwardClientHandlers.ts';
import type { ForwardClientParent } from './forwardClientHandlers.ts';

const makeParent = (seen: Ref.Ref<unknown[]>): ForwardClientParent =>
  ({
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
  }) as ForwardClientParent;

describe('makeForwardClientHandlerMap', () => {
  const store = new Map<string, MapFsEntry>();

  beforeEach(() => {
    store.clear();
  });

  layer(mapFsTestServices(store))(layeredIt => {
    layeredIt.effect('forwards session/update to the parent client', () =>
      Effect.gen(function* () {
        const seen = yield* Ref.make<unknown[]>([]);
        const handlers = makeForwardClientHandlerMap(makeParent(seen));
        const payload = {
          sessionId: 'sess-1',
          update: { content: { text: 'hi', type: 'text' }, sessionUpdate: 'agent_message_chunk' },
        };
        yield* handlers['session/update'](payload);

        assert.deepStrictEqual(yield* Ref.get(seen), [payload]);
      }),
    );

    layeredIt.effect('session_info_update persists title on adapter roster then forwards', () =>
      Effect.gen(function* () {
        yield* upsertRosterEntry({ cwd: '/tmp/proj', sessionId: 'sess-1' });
        const seen = yield* Ref.make<unknown[]>([]);
        const handlers = makeForwardClientHandlerMap(makeParent(seen));
        const payload = {
          sessionId: 'sess-1',
          update: { sessionUpdate: 'session_info_update', title: 'Implement auth' },
        };
        yield* handlers['session/update'](payload);

        const listed = yield* listRosterSessions();
        assert.strictEqual(listed.sessions[0]?.title, 'Implement auth');
        assert.deepStrictEqual(yield* Ref.get(seen), [payload]);
      }),
    );
  });
});
