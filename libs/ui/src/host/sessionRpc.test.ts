import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Scope } from 'effect';

import type { BackendConnectionReports } from './sessionRpc.ts';
import { listSessionsPayload } from './sessionListScope.ts';
import { BackendNotConnected, listSessions, registerBackendConnection } from './sessionRpc.ts';

const LT = 'codex-acp' as const;
const listPayload = listSessionsPayload({ _tag: 'Unscoped' })!;

/** Connection whose `session/list` answers with `name`; reports record `'lost'` in `events`. */
const fakeConnection = (name: string) =>
  ({
    agent: { 'session/list': () => Effect.succeed({ name, sessions: [] }) },
  }) as unknown as Parameters<typeof registerBackendConnection>[1];

const recordingReports = (events: string[]): BackendConnectionReports => ({
  onConfigIndexEvent: () => undefined,
  onConnectionLost: () => {
    events.push('lost');
  },
});

const listedName = listSessions(LT, listPayload).pipe(
  Effect.map(result => (result as unknown as { name: string }).name),
);

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
});
