/** Additional directories on the wire: sent by `session/new|load|resume|fork` only when the Agent is capable and the list is non-empty. */
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { CODEX, installFakeAgent } from '../atoms/fakeAgent.testing.ts';
import type { SessionRequest } from '../atoms/fakeAgent.testing.ts';

import { listSessionPage } from './listSessionPages.ts';
import { createSession, forkSession, loadSession, resumeSession } from './sessionRpc.ts';

const DIRS = ['/lib/a', '/lib/b'];

/** Every session RPC once with `directories`; what the Agent received, per RPC. */
const requestsFor = (capable: boolean, directories: readonly string[] | undefined) =>
  Effect.gen(function* () {
    const requests: SessionRequest[] = [];
    yield* installFakeAgent([], { additionalDirectories: capable, requests });
    yield* createSession(CODEX, '/w', { additionalDirectories: directories });
    yield* loadSession(CODEX, 's1', '/w', directories);
    yield* resumeSession(CODEX, 's2', '/w', directories);
    yield* forkSession(CODEX, 's3', '/w', directories);
    return requests;
  });

describe('Additional directories on session requests', () => {
  it.effect('are sent on new, load, resume and fork when the Agent is capable and the list is non-empty', () =>
    Effect.gen(function* () {
      const requests = yield* requestsFor(true, DIRS);

      assert.deepStrictEqual(
        requests.map(request => request.rpc),
        ['new', 'load', 'resume', 'fork'],
      );
      for (const { params } of requests) {
        assert.deepStrictEqual(params.additionalDirectories, DIRS);
        assert.strictEqual(params.cwd, '/w');
      }
    }),
  );

  it.effect('are never sent when the Agent is not capable', () =>
    Effect.gen(function* () {
      for (const { params } of yield* requestsFor(false, DIRS)) {
        assert.isFalse('additionalDirectories' in params);
      }
    }),
  );

  it.effect('are omitted (no key) for an empty or absent list, even when capable', () =>
    Effect.gen(function* () {
      for (const directories of [[], undefined]) {
        for (const { params } of yield* requestsFor(true, directories)) {
          assert.isFalse('additionalDirectories' in params);
        }
      }
    }),
  );

  it.effect('never send the workspace file', () =>
    Effect.gen(function* () {
      const requests: SessionRequest[] = [];
      yield* installFakeAgent([], { additionalDirectories: true, requests });

      const created = yield* createSession(CODEX, '/w', {
        additionalDirectories: DIRS,
        workspaceFile: '/w/app.code-workspace',
      });

      assert.isFalse('workspaceFile' in requests[0].params);
      assert.deepStrictEqual(created.directories, {
        additionalDirectories: DIRS,
        workspaceFile: '/w/app.code-workspace',
      });
    }),
  );
});

describe('session/list', () => {
  it.effect('is requested exactly as asked: no Additional directories', () =>
    Effect.gen(function* () {
      const payloads: unknown[] = [];
      const agent = {
        'session/list': (payload: unknown) => {
          payloads.push(payload);
          return Effect.succeed({ sessions: [] });
        },
      };

      yield* listSessionPage(agent as never, { cwd: '/w' }, 'next');

      assert.deepStrictEqual(payloads, [{ cursor: 'next', cwd: '/w' }]);
    }),
  );
});
