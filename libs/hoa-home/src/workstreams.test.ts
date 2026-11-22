import { assert, describe, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { beforeEach } from 'vitest';

import {
  adoptSession,
  createWorkstream,
  deleteWorkstream,
  orphanSession,
  readWorkstreams,
  renameWorkstream,
  setWorkstreamArchived,
  workstreamsPath,
} from './index.ts';
import { mapFsTestServices } from './testing/mapFsTestServices.ts';
import type { MapFsEntry } from './testing/mapFsTestServices.ts';

const store = new Map<string, MapFsEntry>();
const file = '/home/operator/.hoa/workstreams.json';
const s1 = { launchTarget: 'codex-acp', sessionId: 's1' };
const s2 = { launchTarget: 'codex-acp', sessionId: 's2' };

describe('workstreams', () => {
  beforeEach(() => {
    store.clear();
  });
  layer(mapFsTestServices(store))(testIt => {
    testIt.effect('reads empty when missing; creates and renames', () =>
      Effect.gen(function* () {
        assert.strictEqual(yield* workstreamsPath(), file);
        assert.deepStrictEqual(yield* readWorkstreams(), { workstreams: [] });
        const created = yield* createWorkstream('Auth');
        assert.strictEqual(created.name, 'Auth');
        assert.isFalse(created.archived);
        assert.deepStrictEqual(created.sessions, []);
        yield* renameWorkstream(created.id, 'Auth 2');
        const [ws] = (yield* readWorkstreams()).workstreams;
        assert.strictEqual(ws?.name, 'Auth 2');
      }),
    );

    testIt.effect('adopt moves a session out of any other Workstream; orphan removes it', () =>
      Effect.gen(function* () {
        const a = yield* createWorkstream('A');
        const b = yield* createWorkstream('B');
        yield* adoptSession(a.id, s1);
        yield* adoptSession(a.id, s1);
        yield* adoptSession(b.id, s1);
        yield* adoptSession(b.id, s2);
        let docs = (yield* readWorkstreams()).workstreams;
        assert.deepStrictEqual(docs[0]?.sessions, []);
        assert.deepStrictEqual(docs[1]?.sessions, [s1, s2]);
        yield* orphanSession(s1);
        docs = (yield* readWorkstreams()).workstreams;
        assert.deepStrictEqual(docs[1]?.sessions, [s2]);
        yield* orphanSession(s2);
        assert.deepStrictEqual((yield* readWorkstreams()).workstreams[1]?.sessions, []);
      }),
    );

    testIt.effect('concurrent updates are serialized, none is lost', () =>
      Effect.gen(function* () {
        const slowRead = Effect.updateService(FileSystem, fs => ({
          ...fs,
          readFileString: (...args: Parameters<typeof fs.readFileString>) =>
            fs.readFileString(...args).pipe(Effect.tap(() => Effect.yieldNow)),
        }));
        const created = yield* Effect.forEach(
          Array.from({ length: 10 }, (_, index) => `W${String(index)}`),
          name => createWorkstream(name),
          { concurrency: 'unbounded' },
        ).pipe(slowRead);
        assert.strictEqual((yield* readWorkstreams()).workstreams.length, 10);
        yield* Effect.forEach(
          created,
          ws => adoptSession(ws.id, { launchTarget: 'codex-acp', sessionId: `s-${ws.name}` }),
          { concurrency: 'unbounded' },
        ).pipe(slowRead);
        const docs = (yield* readWorkstreams()).workstreams;
        assert.deepStrictEqual(
          docs.map(ws => ws.sessions.length),
          Array.from({ length: 10 }, () => 1),
        );
      }),
    );

    testIt.effect('archives and deletes (sessions are orphaned with it)', () =>
      Effect.gen(function* () {
        const a = yield* createWorkstream('A');
        yield* adoptSession(a.id, s1);
        yield* setWorkstreamArchived(a.id, true);
        assert.isTrue((yield* readWorkstreams()).workstreams[0]?.archived);
        yield* deleteWorkstream(a.id);
        assert.deepStrictEqual((yield* readWorkstreams()).workstreams, []);
      }),
    );

    testIt.effect('never overwrites a malformed file', () =>
      Effect.gen(function* () {
        store.set(file, { kind: 'file', content: '{bad' });
        assert.isTrue(Exit.isFailure(yield* Effect.exit(createWorkstream('A'))));
        assert.deepStrictEqual(store.get(file), { kind: 'file', content: '{bad' });
        assert.isTrue(Exit.isFailure(yield* Effect.exit(readWorkstreams())));
      }),
    );
  });
});
