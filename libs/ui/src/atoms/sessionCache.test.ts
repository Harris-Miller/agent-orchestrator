import { assert, beforeEach, describe, it, layer } from '@effect/vitest';
import { readSessionIndex, sessionIndexPath, sessionIndexRows, updateSessionIndex } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Deferred, Effect, Fiber, Layer } from 'effect';
import { FileSystem } from 'effect/FileSystem';

import { createHostRuntime } from '../createHostRuntime.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { CODEX, freshRegistry } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { createProjectsAtoms, projectsAtom, projectsLoadedAtom } from './projects.atoms.ts';
import { runAtomFn } from './runAtomFn.ts';
import {
  hydrateSessionCache,
  indexRowsByCwd,
  removeSessionCacheCwd,
  settleSessionCacheWrites,
  startSessionCachePersistence,
} from './sessionCache.ts';
import { listedCwdsAtom } from './listedCwds.atoms.ts';
import { listKey, sessionListStatesAtom } from './sessionLists.atoms.ts';

const target = toLaunchTarget(CODEX);

const store = new Map<string, MapFsEntry>();
const testLayer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));

beforeEach(() => {
  store.clear();
});

const setup = Effect.fnUntraced(function* () {
  const registry = yield* freshRegistry;
  const history = () => registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory;
  const setHistory = (rows: readonly { cwd: string; sessionId: string }[]) => {
    updateHarnessSnapshot(registry, CODEX, current => ({ ...current, sessionHistory: rows }));
  };
  const indexed = () =>
    readSessionIndex(target).pipe(Effect.map(document => sessionIndexRows(document).map(row => row.sessionId)));
  const seed = (cwds: Record<string, string[]>) =>
    updateSessionIndex(
      target,
      Object.fromEntries(Object.entries(cwds).map(([cwd, ids]) => [cwd, ids.map(sessionId => ({ cwd, sessionId }))])),
      new Set(),
    );
  const settle = Effect.promise(settleSessionCacheWrites);
  return { history, indexed, registry, seed, settle, setHistory, store };
});

describe('indexRowsByCwd', () => {
  it('groups rows under listed cwds only, strips unavailable, and keys an emptied cwd', () => {
    assert.deepStrictEqual(
      indexRowsByCwd(
        [
          { cwd: '/a', sessionId: 'a1', unavailable: true },
          { cwd: '/other', sessionId: 'o1' },
        ],
        ['/a', '/empty'],
      ),
      { '/a': [{ cwd: '/a', sessionId: 'a1' }], '/empty': [] },
    );
  });
});

layer(testLayer)('Session cache', cached => {
  cached.effect('hydrate marks cached rows of the given cwds unavailable, skips other cwds, keeps snapshot rows', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* s.seed({ '/a': ['cached', 'live'], '/b': ['other'] });
      s.setHistory([{ cwd: '/a', sessionId: 'live' }]);
      const read = yield* hydrateSessionCache(s.registry, CODEX, ['/a']);
      assert.strictEqual(read, true);
      assert.deepStrictEqual(
        s.history().map(e => [e.sessionId, e.unavailable]),
        [
          ['live', undefined],
          ['cached', true],
        ],
      );
    }).pipe(Effect.scoped),
  );

  cached.effect('a failing hydrate read reports not read and does not throw', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      // A directory where the file should be: exists, but reading it is an IO error (not "missing").
      const file = yield* sessionIndexPath(target);
      s.store.set(file, { kind: 'dir' });
      const read = yield* hydrateSessionCache(s.registry, CODEX, ['/a']);
      assert.strictEqual(read, false);
      assert.deepStrictEqual(s.history(), []);
    }).pipe(Effect.scoped),
  );

  cached.effect('persistence writes only listed cwds and skips an unchanged write', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.registry.set(projectsAtom, ['/a']);
      s.registry.set(sessionListStatesAtom, new Map([[listKey(CODEX, '/a'), 'complete']]));
      const stop = yield* startSessionCachePersistence(s.registry, CODEX, () => s.registry.get(listedCwdsAtom));
      s.setHistory([
        { cwd: '/a', sessionId: 'a1' },
        { cwd: '/unlisted', sessionId: 'u1' },
      ]);
      yield* s.settle;
      assert.deepStrictEqual(yield* s.indexed(), ['a1']);
      // Unchanged: an external edit survives a snapshot change that produces the same index content.
      yield* s.seed({ '/a': ['external'] });
      s.setHistory([
        { cwd: '/a', sessionId: 'a1' },
        { cwd: '/unlisted', sessionId: 'u2' },
      ]);
      yield* s.settle;
      assert.deepStrictEqual(yield* s.indexed(), ['external']);
      stop();
    }).pipe(Effect.scoped),
  );

  cached.effect('a throwing work item does not stop later persists or removals', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.registry.set(projectsAtom, ['/a']);
      let calls = 0;
      const stop = yield* startSessionCachePersistence(s.registry, CODEX, () => {
        calls += 1;
        if (calls === 1) throw new Error('boom');
        return s.registry.get(listedCwdsAtom);
      });
      s.setHistory([{ cwd: '/a', sessionId: 'a1' }]);
      // Removal of an unrelated cwd is a barrier: it runs after every write queued before it.
      yield* removeSessionCacheCwd('/barrier');
      s.setHistory([{ cwd: '/a', sessionId: 'a2' }]);
      yield* removeSessionCacheCwd('/barrier');
      assert.deepStrictEqual(yield* s.indexed(), ['a2']);
      yield* removeSessionCacheCwd('/a');
      assert.deepStrictEqual(yield* s.indexed(), []);
      stop();
    }).pipe(Effect.scoped),
  );

  cached.effect('remove then re-add the same cwd with the same rows rewrites the entry', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.registry.set(projectsAtom, ['/a']);
      const stop = yield* startSessionCachePersistence(s.registry, CODEX, () => s.registry.get(listedCwdsAtom));
      s.setHistory([{ cwd: '/a', sessionId: 'a1' }]);
      yield* s.settle;
      assert.deepStrictEqual(yield* s.indexed(), ['a1']);
      s.registry.set(projectsAtom, []);
      yield* removeSessionCacheCwd('/a');
      assert.deepStrictEqual(yield* s.indexed(), []);
      s.registry.set(projectsAtom, ['/a']);
      // Same rows as before: a snapshot notification with equal content.
      updateHarnessSnapshot(s.registry, CODEX, current => ({
        ...current,
        sessionHistory: [...current.sessionHistory],
      }));
      yield* s.settle;
      assert.deepStrictEqual(yield* s.indexed(), ['a1']);
      stop();
    }).pipe(Effect.scoped),
  );

  cached.effect('adding a Project shows its cached rows as unavailable before listing', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* s.seed({ '/new': ['cached'] });
      s.registry.set(projectsLoadedAtom, true);
      const { addProjectAtomFn } = createProjectsAtoms(createHostRuntime(testLayer));
      yield* runAtomFn(s.registry, addProjectAtomFn, '/new');
      assert.deepStrictEqual(
        s.history().map(e => [e.sessionId, e.unavailable]),
        [['cached', true]],
      );
    }).pipe(Effect.scoped),
  );
});

describe('Session cache queue', () => {
  it.effect('remove while a persist is in flight does not resurrect the cwd', () =>
    Effect.gen(function* () {
      const gatedStore = new Map<string, MapFsEntry>();
      const entered = yield* Deferred.make<undefined>();
      const release = yield* Deferred.make<undefined>();
      let gated = false;
      // Hold the first index write after its rows were computed (with /a), until released.
      const gate = Layer.effect(
        FileSystem,
        Effect.gen(function* () {
          const inner = yield* FileSystem;
          return FileSystem.of({
            ...inner,
            writeFileString: (path, data, options) =>
              Effect.gen(function* () {
                if (!gated) {
                  gated = true;
                  yield* Deferred.succeed(entered, undefined);
                  yield* Deferred.await(release);
                }
                return yield* inner.writeFileString(path, data, options);
              }),
          });
        }),
      ).pipe(Layer.provideMerge(mapFsTestServices(gatedStore)));
      const gatedLayer = Layer.mergeAll(mockHostLayer, gate);
      const registry = yield* freshRegistry;
      registry.set(projectsAtom, ['/a', '/b']);
      registry.set(projectsLoadedAtom, true);
      yield* Effect.gen(function* () {
        const stop = yield* startSessionCachePersistence(registry, CODEX, () => registry.get(listedCwdsAtom));
        updateHarnessSnapshot(registry, CODEX, current => ({
          ...current,
          sessionHistory: [
            { cwd: '/a', sessionId: 'a1' },
            { cwd: '/b', sessionId: 'b1' },
          ],
        }));
        yield* Deferred.await(entered);
        registry.set(projectsAtom, ['/b']);
        const removal = yield* Effect.forkChild(removeSessionCacheCwd('/a'));
        // One macrotask: lets a removal that bypassed the shared queue run to completion while the persist is still held.
        yield* Effect.promise(
          () =>
            new Promise<void>(resolve => {
              setTimeout(resolve, 0);
            }),
        );
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(removal);
        const document = yield* readSessionIndex(target);
        assert.deepStrictEqual(
          sessionIndexRows(document).map(row => row.sessionId),
          ['b1'],
        );
        stop();
      }).pipe(Effect.provide(gatedLayer));
    }).pipe(Effect.scoped),
  );
});
