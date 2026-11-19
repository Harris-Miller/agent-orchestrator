import { assert, describe, it } from '@effect/vitest';
import { readSessionIndex, sessionIndexPath, sessionIndexRows, updateSessionIndex } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';

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
  startSessionCachePersistence,
} from './sessionCache.ts';
import { listedCwdsAtom } from './listedCwds.atoms.ts';
import { listKey, sessionListStatesAtom } from './sessionLists.atoms.ts';

const target = toLaunchTarget(CODEX);

const setup = Effect.fnUntraced(function* () {
  const store = new Map<string, MapFsEntry>();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
  const registry = yield* freshRegistry;
  const history = () => registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory;
  const setHistory = (rows: readonly { cwd: string; sessionId: string }[]) => {
    updateHarnessSnapshot(registry, CODEX, current => ({ ...current, sessionHistory: rows }));
  };
  const indexed = () =>
    readSessionIndex(target).pipe(
      Effect.provide(layer),
      Effect.map(document => sessionIndexRows(document).map(row => row.sessionId)),
    );
  const seed = (cwds: Record<string, string[]>) =>
    updateSessionIndex(
      target,
      Object.fromEntries(Object.entries(cwds).map(([cwd, ids]) => [cwd, ids.map(sessionId => ({ cwd, sessionId }))])),
      new Set(),
    ).pipe(Effect.provide(layer));
  const settle = Effect.promise(
    () =>
      new Promise<void>(resolve => {
        setTimeout(resolve, 20);
      }),
  );
  return { history, indexed, layer, registry, seed, settle, setHistory, store };
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

describe('Session cache', () => {
  it.effect('hydrate marks cached rows of the given cwds unavailable, skips other cwds, keeps snapshot rows', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* s.seed({ '/a': ['cached', 'live'], '/b': ['other'] });
      s.setHistory([{ cwd: '/a', sessionId: 'live' }]);
      const read = yield* hydrateSessionCache(s.registry, CODEX, ['/a']).pipe(Effect.provide(s.layer));
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

  it.effect('a failing hydrate read reports not read and does not throw', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      // A directory where the file should be: exists, but reading it is an IO error (not "missing").
      const file = yield* sessionIndexPath(target).pipe(Effect.provide(s.layer));
      s.store.set(file, { kind: 'dir' });
      const read = yield* hydrateSessionCache(s.registry, CODEX, ['/a']).pipe(Effect.provide(s.layer));
      assert.strictEqual(read, false);
      assert.deepStrictEqual(s.history(), []);
    }).pipe(Effect.scoped),
  );

  it.effect('persistence writes only listed cwds and skips an unchanged write', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.registry.set(projectsAtom, ['/a']);
      s.registry.set(sessionListStatesAtom, new Map([[listKey(CODEX, '/a'), 'complete']]));
      const stop = yield* startSessionCachePersistence(s.registry, CODEX, () => s.registry.get(listedCwdsAtom)).pipe(
        Effect.provide(s.layer),
      );
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

  it.effect('remove while a persist is in flight does not resurrect the cwd', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.registry.set(projectsAtom, ['/a', '/b']);
      s.registry.set(projectsLoadedAtom, true);
      const stop = yield* startSessionCachePersistence(s.registry, CODEX, () => s.registry.get(listedCwdsAtom)).pipe(
        Effect.provide(s.layer),
      );
      s.setHistory([
        { cwd: '/a', sessionId: 'a1' },
        { cwd: '/b', sessionId: 'b1' },
      ]);
      s.registry.set(projectsAtom, ['/b']);
      s.setHistory([{ cwd: '/b', sessionId: 'b1' }]);
      yield* removeSessionCacheCwd('/a').pipe(Effect.provide(s.layer));
      yield* s.settle;
      assert.deepStrictEqual(yield* s.indexed(), ['b1']);
      stop();
    }).pipe(Effect.scoped),
  );

  it.effect('remove then re-add the same cwd with the same rows rewrites the entry', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      s.registry.set(projectsAtom, ['/a']);
      const stop = yield* startSessionCachePersistence(s.registry, CODEX, () => s.registry.get(listedCwdsAtom)).pipe(
        Effect.provide(s.layer),
      );
      s.setHistory([{ cwd: '/a', sessionId: 'a1' }]);
      yield* s.settle;
      assert.deepStrictEqual(yield* s.indexed(), ['a1']);
      s.registry.set(projectsAtom, []);
      yield* removeSessionCacheCwd('/a').pipe(Effect.provide(s.layer));
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

  it.effect('adding a Project shows its cached rows as unavailable before listing', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* s.seed({ '/new': ['cached'] });
      s.registry.set(projectsLoadedAtom, true);
      const { addProjectAtomFn } = createProjectsAtoms(createHostRuntime(s.layer));
      yield* runAtomFn(s.registry, addProjectAtomFn, '/new');
      assert.deepStrictEqual(
        s.history().map(e => [e.sessionId, e.unavailable]),
        [['cached', true]],
      );
    }).pipe(Effect.scoped),
  );
});
