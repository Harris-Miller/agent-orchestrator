import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Scope } from 'effect';

import type { BackendConnectionReports } from './sessionRpc.ts';
import { listSessionsPayload } from './sessionListScope.ts';
import {
  BackendNotConnected,
  cwdOfSubscription,
  listSessions,
  registerBackendConnection,
  setBackendSessionListSubscribe,
  syncSessionListSubscriptions,
} from './sessionRpc.ts';

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
  let name = '';
  return listSessions(LT, listPayload, page => {
    ({ name } = page as { name: string });
  }).pipe(Effect.map(() => name));
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

  it.effect('listSessions hands over every page of the agent list', () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      const s = (sessionId: string) => ({ sessionId, cwd: '/w' });
      yield* registerBackendConnection(
        LT,
        pagedConnection({ '': { sessions: [s('a')], nextCursor: 'c1' }, c1: { sessions: [s('b')] } }),
        recordingReports([]),
      ).pipe(Scope.provide(scope));
      const ids: string[] = [];
      yield* listSessions(LT, listPayload, page => {
        ids.push(...(page as { sessions: { sessionId: string }[] }).sessions.map(x => x.sessionId));
      });
      assert.deepStrictEqual(ids, ['a', 'b']);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect('listSessions fails when a later page fails (earlier pages were already handed over)', () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      yield* registerBackendConnection(
        LT,
        pagedConnection({ '': { sessions: [{ sessionId: 'a', cwd: '/w' }], nextCursor: 'c1' }, c1: 'fail' }),
        recordingReports([]),
      ).pipe(Scope.provide(scope));
      const exit = yield* Effect.exit(listSessions(LT, listPayload, () => undefined));
      assert.isTrue(Exit.isFailure(exit));
      yield* Scope.close(scope, Exit.void);
    }),
  );
});

describe('session list subscriptions', () => {
  /** Connection whose subscribe / unsubscribe record `calls`; a cwd in `failing` fails to subscribe. */
  const subscribingConnection = (calls: string[], failing: readonly string[] = []) =>
    ({
      agent: {},
      sessionListSubscribe: ({ cwd }: { cwd: string }) => {
        calls.push(`sub ${cwd}`);
        return failing.includes(cwd) ? Effect.fail(new Error('boom')) : Effect.succeed({ subscriptionId: `id-${cwd}` });
      },
      sessionListUnsubscribe: ({ subscriptionId }: { subscriptionId: string }) => {
        calls.push(`unsub ${subscriptionId}`);
        return Effect.succeed({});
      },
    }) as unknown as Parameters<typeof registerBackendConnection>[1];

  const register = (calls: string[], supported: boolean, failing: readonly string[] = []) =>
    Effect.gen(function* () {
      const scope = yield* Scope.make();
      yield* registerBackendConnection(LT, subscribingConnection(calls, failing), recordingReports([])).pipe(
        Scope.provide(scope),
      );
      setBackendSessionListSubscribe(LT, supported);
      return scope;
    });

  it.effect('subscribes added cwds, unsubscribes removed ones and resolves subscription ids to cwds', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const scope = yield* register(calls, true);
      yield* syncSessionListSubscriptions(LT, ['/a', '/b']);
      assert.deepStrictEqual(calls, ['sub /a', 'sub /b']);
      assert.strictEqual(cwdOfSubscription(LT, 'id-/b'), '/b');

      calls.length = 0;
      yield* syncSessionListSubscriptions(LT, ['/b', '/c']);
      assert.deepStrictEqual(calls, ['unsub id-/a', 'sub /c']);
      assert.strictEqual(cwdOfSubscription(LT, 'id-/a'), undefined);
      assert.strictEqual(cwdOfSubscription(LT, 'nope'), undefined);

      calls.length = 0;
      yield* syncSessionListSubscriptions(LT, ['/b', '/c']);
      assert.deepStrictEqual(calls, []);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect('subscribes at most 128 cwds', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const scope = yield* register(calls, true);
      yield* syncSessionListSubscriptions(
        LT,
        Array.from({ length: 130 }, (_, index) => `/p${index}`),
      );
      assert.strictEqual(calls.length, 128);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect('makes no calls without the capability or without a connection', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* syncSessionListSubscriptions(LT, ['/a']);
      const scope = yield* register(calls, false);
      yield* syncSessionListSubscriptions(LT, ['/a']);
      assert.deepStrictEqual(calls, []);
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect('a failed unsubscribe keeps the entry, counts against the cap and is retried by the next sync', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      let failUnsubscribe = true;
      const scope = yield* Scope.make();
      yield* registerBackendConnection(
        LT,
        {
          agent: {},
          sessionListSubscribe: ({ cwd }: { cwd: string }) => Effect.succeed({ subscriptionId: `id-${cwd}` }),
          sessionListUnsubscribe: ({ subscriptionId }: { subscriptionId: string }) => {
            calls.push(`unsub ${subscriptionId}`);
            return failUnsubscribe ? Effect.fail(new Error('boom')) : Effect.succeed({});
          },
        } as unknown as Parameters<typeof registerBackendConnection>[1],
        recordingReports([]),
      ).pipe(Scope.provide(scope));
      setBackendSessionListSubscribe(LT, true);
      const many = Array.from({ length: 128 }, (_, index) => `/p${index}`);
      yield* syncSessionListSubscriptions(LT, many);

      yield* syncSessionListSubscriptions(LT, ['/new', ...many.slice(1)]);
      assert.deepStrictEqual(calls, ['unsub id-/p0']);
      assert.strictEqual(cwdOfSubscription(LT, 'id-/p0'), '/p0');
      assert.strictEqual(cwdOfSubscription(LT, 'id-/new'), undefined);

      failUnsubscribe = false;
      yield* syncSessionListSubscriptions(LT, ['/new', ...many.slice(1)]);
      assert.deepStrictEqual(calls, ['unsub id-/p0', 'unsub id-/p0']);
      assert.strictEqual(cwdOfSubscription(LT, 'id-/p0'), undefined);
      assert.strictEqual(cwdOfSubscription(LT, 'id-/new'), '/new');
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect('logs a failed subscribe instead of raising it and keeps the other cwds', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const scope = yield* register(calls, true, ['/a']);
      yield* syncSessionListSubscriptions(LT, ['/a', '/b']);
      assert.deepStrictEqual(calls, ['sub /a', 'sub /b']);
      assert.strictEqual(cwdOfSubscription(LT, 'id-/a'), undefined);
      assert.strictEqual(cwdOfSubscription(LT, 'id-/b'), '/b');
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect('subscriptions are gone once the connection scope closes', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const scope = yield* register(calls, true);
      yield* syncSessionListSubscriptions(LT, ['/a']);
      yield* Scope.close(scope, Exit.void);
      assert.strictEqual(cwdOfSubscription(LT, 'id-/a'), undefined);
      calls.length = 0;
      yield* syncSessionListSubscriptions(LT, ['/a']);
      assert.deepStrictEqual(calls, []);
    }),
  );
});
