import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { listAllSessions, RepeatedSessionListCursor, TooManySessionListPages } from './listAllSessions.ts';

type Page = { readonly sessions: readonly { sessionId: string; cwd: string }[]; readonly nextCursor?: string };
const s = (id: string) => ({ sessionId: id, cwd: '/w' });

/** Fake agent serving `pages` by cursor ('' = first); records every request. */
const fakeAgent = (pages: Record<string, Page | 'fail'>) => {
  const requests: Record<string, unknown>[] = [];
  const agent = {
    'session/list': (req: Record<string, unknown>) =>
      Effect.suspend(() => {
        requests.push(req);
        const page = pages[(req.cursor as string | undefined) ?? ''];
        return page === 'fail' ? Effect.fail(new Error('boom')) : Effect.succeed(page);
      }),
  } as unknown as Parameters<typeof listAllSessions>[0];
  return { agent, requests };
};

describe('listAllSessions', () => {
  it.effect('merges pages in order, sends no cursor first, then the cursor, and drops nextCursor', () =>
    Effect.gen(function* () {
      const { agent, requests } = fakeAgent({
        '': { sessions: [s('a'), s('b')], nextCursor: 'c1' },
        c1: { sessions: [s('c')], nextCursor: 'c2' },
        c2: { sessions: [s('d')] },
      });
      const result = yield* listAllSessions(agent, { cwd: '/w' });
      assert.deepStrictEqual(
        result.sessions.map(x => x.sessionId),
        ['a', 'b', 'c', 'd'],
      );
      assert.isFalse('nextCursor' in result);
      assert.deepStrictEqual(requests, [{ cwd: '/w' }, { cwd: '/w', cursor: 'c1' }, { cwd: '/w', cursor: 'c2' }]);
    }),
  );

  it.effect('single page needs one call', () =>
    Effect.gen(function* () {
      const { agent, requests } = fakeAgent({ '': { sessions: [s('a')] } });
      const result = yield* listAllSessions(agent, {});
      assert.strictEqual(result.sessions.length, 1);
      assert.strictEqual(requests.length, 1);
      assert.isFalse('cursor' in requests[0]);
    }),
  );

  it.effect('a failing later page fails the whole list', () =>
    Effect.gen(function* () {
      const { agent } = fakeAgent({ '': { sessions: [s('a')], nextCursor: 'c1' }, c1: 'fail' });
      const exit = yield* Effect.exit(listAllSessions(agent, {}));
      assert.isTrue(exit._tag === 'Failure');
    }),
  );

  it.effect('a repeated cursor fails instead of looping', () =>
    Effect.gen(function* () {
      const { agent } = fakeAgent({
        '': { sessions: [s('a')], nextCursor: 'c1' },
        c1: { sessions: [s('b')], nextCursor: 'c1' },
      });
      const error = yield* Effect.flip(listAllSessions(agent, {}));
      assert.instanceOf(error, RepeatedSessionListCursor);
      assert.strictEqual(error.cursor, 'c1');
    }),
  );

  it.effect('an agent that always returns a fresh cursor fails at the page cap', () =>
    Effect.gen(function* () {
      let calls = 0;
      const agent = {
        'session/list': () =>
          Effect.sync(() => {
            calls += 1;
            return { sessions: [s('x')], nextCursor: `c${calls}` };
          }),
      } as unknown as Parameters<typeof listAllSessions>[0];
      const error = yield* Effect.flip(listAllSessions(agent, {}));
      assert.instanceOf(error, TooManySessionListPages);
      assert.strictEqual(error.pages, calls);
    }),
  );
});
