import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { listSessionPages, RepeatedSessionListCursor, TooManySessionListPages } from './listSessionPages.ts';

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
  } as unknown as Parameters<typeof listSessionPages>[0];
  return { agent, requests };
};

/** Runs the pager, returning the session ids delivered so far and the pager's exit. */
const collect = (agent: Parameters<typeof listSessionPages>[0], payload: Record<string, unknown>) =>
  Effect.gen(function* () {
    const ids: string[] = [];
    const exit = yield* Effect.exit(
      listSessionPages(agent, payload, page => {
        ids.push(...page.sessions.map(row => row.sessionId));
      }),
    );
    return { exit, ids };
  });

describe('listSessionPages', () => {
  it.effect('hands pages over in order, sends no cursor first, then the cursor', () =>
    Effect.gen(function* () {
      const { agent, requests } = fakeAgent({
        '': { sessions: [s('a'), s('b')], nextCursor: 'c1' },
        c1: { sessions: [s('c')], nextCursor: 'c2' },
        c2: { sessions: [s('d')] },
      });
      const { exit, ids } = yield* collect(agent, { cwd: '/w' });
      assert.strictEqual(exit._tag, 'Success');
      assert.deepStrictEqual(ids, ['a', 'b', 'c', 'd']);
      assert.deepStrictEqual(requests, [{ cwd: '/w' }, { cwd: '/w', cursor: 'c1' }, { cwd: '/w', cursor: 'c2' }]);
    }),
  );

  it.effect('single page needs one call', () =>
    Effect.gen(function* () {
      const { agent, requests } = fakeAgent({ '': { sessions: [s('a')] } });
      const { ids } = yield* collect(agent, {});
      assert.deepStrictEqual(ids, ['a']);
      assert.strictEqual(requests.length, 1);
      assert.isFalse('cursor' in requests[0]);
    }),
  );

  it.effect('a failing later page fails the list but keeps the pages already delivered', () =>
    Effect.gen(function* () {
      const { agent } = fakeAgent({ '': { sessions: [s('a')], nextCursor: 'c1' }, c1: 'fail' });
      const { exit, ids } = yield* collect(agent, {});
      assert.strictEqual(exit._tag, 'Failure');
      assert.deepStrictEqual(ids, ['a']);
    }),
  );

  it.effect('a repeated cursor fails instead of looping', () =>
    Effect.gen(function* () {
      const { agent } = fakeAgent({
        '': { sessions: [s('a')], nextCursor: 'c1' },
        c1: { sessions: [s('b')], nextCursor: 'c1' },
      });
      const error = yield* Effect.flip(listSessionPages(agent, {}, () => undefined));
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
      } as unknown as Parameters<typeof listSessionPages>[0];
      const error = yield* Effect.flip(listSessionPages(agent, {}, () => undefined));
      assert.instanceOf(error, TooManySessionListPages);
      assert.strictEqual(error.pages, calls);
    }),
  );
});
