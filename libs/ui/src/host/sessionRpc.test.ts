import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Scope } from 'effect';

import type { BackendConnectionReports } from './sessionRpc.ts';
import { listSessionsPayload } from './sessionListScope.ts';
import { BackendNotConnected, listSessionsPage, registerBackendConnection } from './sessionRpc.ts';

const LT = 'codex-acp' as const;
const listPayload = listSessionsPayload(LT, '/w');

/** Connection whose `session/list` answers with `name`; reports record `'lost'` in `events`. */
const fakeConnection = (name: string) =>
  ({
    agent: { 'session/list': () => Effect.succeed({ name, sessions: [] }) },
  }) as unknown as Parameters<typeof registerBackendConnection>[1];

/** Connection whose `session/list` serves `pages` by cursor ('' = first); a page of `'fail'` fails. */
const pagedConnection = (
  pages: Record<string, { sessions: { sessionId: string; cwd: string }[]; nextCursor?: string } | 'fail'>,
) =>
  ({
    agent: {
      'session/list': (req: { cursor?: string }) => {
        const page = pages[req.cursor ?? ''];
        return page === 'fail' ? Effect.fail(new Error('boom')) : Effect.succeed(page);
      },
    },
  }) as unknown as Parameters<typeof registerBackendConnection>[1];

const recordingReports = (events: string[]): BackendConnectionReports => ({
  onConfigIndexEvent: () => undefined,
  onConnectionLost: () => {
    events.push('lost');
  },
});

const listedName = Effect.suspend(() => {
  return listSessionsPage(LT, listPayload, undefined).pipe(
    Effect.map(page => (page as unknown as { name: string }).name),
  );
});

describe('registerBackendConnection', () => {
  it.effect('session RPCs reach the connection while registered and fail BackendNotConnected after release', () =>
    Effect.gen(function* () {
      const events: string[] = [];
      const scope = yield* Scope.make();
      yield* registerBackendConnection(LT, fakeConnection('a'), recordingReports(events)).pipe(Scope.provide(scope));
      assert.strictEqual(yield* listedName, 'a');

      yield* Scope.close(scope, Exit.void);
      assert.deepStrictEqual(events, ['lost']);
      const error = yield* Effect.flip(listedName);
      assert.instanceOf(error, BackendNotConnected);
    }),
  );

  it.effect('a superseded registration is released silently', () =>
    Effect.gen(function* () {
      const eventsA: string[] = [];
      const eventsB: string[] = [];
      const scopeA = yield* Scope.make();
      const scopeB = yield* Scope.make();
      yield* registerBackendConnection(LT, fakeConnection('a'), recordingReports(eventsA)).pipe(Scope.provide(scopeA));
      yield* registerBackendConnection(LT, fakeConnection('b'), recordingReports(eventsB)).pipe(Scope.provide(scopeB));

      yield* Scope.close(scopeA, Exit.void);
      assert.deepStrictEqual(eventsA, []);
      assert.strictEqual(yield* listedName, 'b');

      yield* Scope.close(scopeB, Exit.void);
      assert.deepStrictEqual(eventsB, ['lost']);
      const error = yield* Effect.flip(listedName);
      assert.instanceOf(error, BackendNotConnected);
    }),
  );

  it.effect('listSessionsPage fetches the page the cursor names', () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const s = (sessionId: string) => ({ sessionId, cwd: '/w' });
      yield* registerBackendConnection(
        LT,
        pagedConnection({ '': { sessions: [s('a')], nextCursor: 'c1' }, c1: { sessions: [s('b')] } }),
        recordingReports([]),
      ).pipe(Scope.provide(scope));
      const first = yield* listSessionsPage(LT, listPayload, undefined);
      assert.strictEqual(first.nextCursor, 'c1');
      const second = yield* listSessionsPage(LT, listPayload, 'c1');
      assert.deepStrictEqual(
        second.sessions.map(row => row.sessionId),
        ['b'],
      );
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect('listSessionsPage fails when the page fails', () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      yield* registerBackendConnection(
        LT,
        pagedConnection({ '': { sessions: [{ sessionId: 'a', cwd: '/w' }], nextCursor: 'c1' }, c1: 'fail' }),
        recordingReports([]),
      ).pipe(Scope.provide(scope));
      const exit = yield* Effect.exit(listSessionsPage(LT, listPayload, 'c1'));
      assert.isTrue(Exit.isFailure(exit));
      yield* Scope.close(scope, Exit.void);
    }),
  );
});
