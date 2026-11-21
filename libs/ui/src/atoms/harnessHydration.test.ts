import { assert, describe, it } from '@effect/vitest';
import {
  addProject,
  pinnedSessionsPath,
  pinSession,
  projectsPath,
  readTrackedSessions,
  trackedSessionRows,
  trackedSessionsPath,
  upsertTrackedSessions,
} from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';

import { toLaunchTarget } from '../host/agentLaunchTarget.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { CLAUDE, CODEX, freshRegistry } from './fakeAgent.testing.ts';
import { hydrateHarnessCaches } from './harnessHydration.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { pinnedSessionsAtom, pinsLoadedAtom } from './pinnedSessions.atoms.ts';
import { projectsAtom, projectsLoadedAtom } from './projects.atoms.ts';
import { settleTrackedSessionWrites } from './trackedSessions.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';

const codex = toLaunchTarget(CODEX);
const claude = toLaunchTarget(CLAUDE);

const setup = Effect.fnUntraced(function* () {
  const store = new Map<string, MapFsEntry>();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
  const registry = yield* freshRegistry;
  const history = (launchTarget: typeof CODEX | typeof CLAUDE) =>
    registry.get(backendHarnessSnapshotAtom(launchTarget)).sessionHistory.map(row => row.sessionId);
  const seedIndex = (target: typeof codex, cwds: Record<string, string[]>) =>
    upsertTrackedSessions(
      target,
      Object.entries(cwds).flatMap(([cwd, ids]) => ids.map(sessionId => ({ cwd, sessionId }))),
    ).pipe(Effect.provide(layer));
  const indexed = (target: typeof codex) =>
    readTrackedSessions(target).pipe(
      Effect.provide(layer),
      Effect.map(document => trackedSessionRows(document).map(row => row.sessionId)),
    );
  const hydrate = hydrateHarnessCaches(registry).pipe(Effect.provide(layer));
  const settle = Effect.promise(settleTrackedSessionWrites);
  /** Registry whose `set` throws (a defect) for the given atoms. */
  const throwingOn = (...bad: readonly unknown[]) =>
    new Proxy(registry, {
      get: (target, prop) => {
        if (prop === 'set') {
          return (atom: unknown, value: unknown) => {
            if (bad.includes(atom)) throw new Error('boom');
            Reflect.apply(target.set, target, [atom, value]);
          };
        }
        const member: unknown = Reflect.get(target, prop);
        if (typeof member !== 'function') return member;
        return (...args: unknown[]): unknown => Reflect.apply(member, target, args) as unknown;
      },
    });
  const setHistory = (rows: readonly { cwd: string; sessionId: string }[]) => {
    updateHarnessSnapshot(registry, CODEX, current => ({ ...current, sessionHistory: rows }));
  };
  return { history, hydrate, indexed, layer, registry, seedIndex, settle, setHistory, store, throwingOn };
});

describe('hydrateHarnessCaches', () => {
  it.effect('reads Projects first, then hydrates Tracked sessions only for the listed cwds', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* addProject('/a').pipe(Effect.provide(s.layer));
      yield* s.seedIndex(codex, { '/a': ['a1'], '/b': ['b1'] });
      const unsubscribe = yield* s.hydrate;
      assert.deepStrictEqual(s.registry.get(projectsAtom), ['/a']);
      assert.strictEqual(s.registry.get(projectsLoadedAtom), true);
      assert.deepStrictEqual(s.history(CODEX), ['a1']);
      assert.isUndefined(s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory[0].unavailable);
      unsubscribe();
    }).pipe(Effect.scoped),
  );

  it.effect('a malformed projects.json leaves Projects unloaded and the file untouched', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const file = yield* projectsPath().pipe(Effect.provide(s.layer));
      s.store.set(file, { content: '{nope', kind: 'file' });
      const unsubscribe = yield* s.hydrate;
      assert.strictEqual(s.registry.get(projectsLoadedAtom), false);
      assert.deepStrictEqual(s.registry.get(projectsAtom), []);
      assert.deepStrictEqual(s.store.get(file), { content: '{nope', kind: 'file' });
      unsubscribe();
    }).pipe(Effect.scoped),
  );

  it.effect('Cwd scope never reads projects.json and still hydrates the Workspace cwd', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const file = yield* projectsPath().pipe(Effect.provide(s.layer));
      s.store.set(file, { content: '{nope', kind: 'file' });
      s.registry.set(sessionListScopeAtom, { _tag: 'Cwd', cwd: '/ws' });
      yield* s.seedIndex(codex, { '/ws': ['w1'], '/a': ['a1'] });
      const unsubscribe = yield* s.hydrate;
      assert.strictEqual(s.registry.get(projectsLoadedAtom), false);
      assert.deepStrictEqual(s.registry.get(projectsAtom), []);
      assert.deepStrictEqual(s.store.get(file), { content: '{nope', kind: 'file' });
      assert.deepStrictEqual(s.history(CODEX), ['w1']);
      unsubscribe();
    }).pipe(Effect.scoped),
  );

  it.effect('Skip scope never reads projects.json', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const file = yield* projectsPath().pipe(Effect.provide(s.layer));
      s.store.set(file, { content: '{nope', kind: 'file' });
      s.registry.set(sessionListScopeAtom, { _tag: 'Skip' });
      const unsubscribe = yield* s.hydrate;
      assert.strictEqual(s.registry.get(projectsLoadedAtom), false);
      assert.deepStrictEqual(s.store.get(file), { content: '{nope', kind: 'file' });
      unsubscribe();
    }).pipe(Effect.scoped),
  );

  it.effect('a malformed pins file leaves that launch target unloaded; the others still hydrate', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* addProject('/a').pipe(Effect.provide(s.layer));
      yield* pinSession(codex, { cwd: '/a', sessionId: 'p1' }).pipe(Effect.provide(s.layer));
      const file = yield* pinnedSessionsPath(claude).pipe(Effect.provide(s.layer));
      s.store.set(file, { content: '{nope', kind: 'file' });
      yield* s.seedIndex(codex, { '/a': ['a1'] });
      const unsubscribe = yield* s.hydrate;
      assert.strictEqual(s.registry.get(pinsLoadedAtom(CLAUDE)), false);
      assert.strictEqual(s.registry.get(pinsLoadedAtom(CODEX)), true);
      assert.deepStrictEqual(
        s.registry.get(pinnedSessionsAtom(CODEX)).map(pin => pin.sessionId),
        ['p1'],
      );
      assert.deepStrictEqual(s.history(CODEX), ['a1']);
      unsubscribe();
    }).pipe(Effect.scoped),
  );

  it.effect('a defect applying one launch target does not stop the other target or Projects', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* addProject('/a').pipe(Effect.provide(s.layer));
      yield* pinSession(claude, { cwd: '/a', sessionId: 'p1' }).pipe(Effect.provide(s.layer));
      yield* s.seedIndex(claude, { '/a': ['c1'] });
      const registry = s.throwingOn(pinnedSessionsAtom(CODEX));
      const unsubscribe = yield* hydrateHarnessCaches(registry).pipe(Effect.provide(s.layer));
      assert.deepStrictEqual(s.registry.get(projectsAtom), ['/a']);
      assert.strictEqual(s.registry.get(pinsLoadedAtom(CODEX)), false);
      assert.deepStrictEqual(
        s.registry.get(pinnedSessionsAtom(CLAUDE)).map(pin => pin.sessionId),
        ['p1'],
      );
      assert.deepStrictEqual(s.history(CLAUDE), ['c1']);
      unsubscribe();
    }).pipe(Effect.scoped),
  );

  it.effect('a defect applying Projects does not stop the launch targets', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* addProject('/a').pipe(Effect.provide(s.layer));
      yield* pinSession(codex, { cwd: '/a', sessionId: 'p1' }).pipe(Effect.provide(s.layer));
      yield* pinSession(claude, { cwd: '/a', sessionId: 'p2' }).pipe(Effect.provide(s.layer));
      const registry = s.throwingOn(projectsAtom);
      const unsubscribe = yield* hydrateHarnessCaches(registry).pipe(Effect.provide(s.layer));
      assert.strictEqual(s.registry.get(projectsLoadedAtom), false);
      assert.deepStrictEqual(
        s.registry.get(pinnedSessionsAtom(CODEX)).map(pin => pin.sessionId),
        ['p1'],
      );
      assert.strictEqual(s.registry.get(pinsLoadedAtom(CLAUDE)), true);
      unsubscribe();
    }).pipe(Effect.scoped),
  );

  it.effect('an unreadable tracked sessions file for one launch target leaves the other hydrated', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* addProject('/a').pipe(Effect.provide(s.layer));
      yield* s.seedIndex(claude, { '/a': ['c1'] });
      const file = yield* trackedSessionsPath(codex).pipe(Effect.provide(s.layer));
      s.store.set(file, { kind: 'dir' });
      const unsubscribe = yield* s.hydrate;
      assert.deepStrictEqual(s.history(CLAUDE), ['c1']);
      unsubscribe();
    }).pipe(Effect.scoped),
  );

  it.effect('an archived row with a Last prompt time is stored as AIR meta and hydrates back as typed fields', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* addProject('/a').pipe(Effect.provide(s.layer));
      yield* upsertTrackedSessions(codex, [
        {
          _meta: { jetbrains: { air: { archived: true, lastPromptAt: '2026-01-01T00:00:00.000Z', model: 'm' } } },
          cwd: '/a',
          sessionId: 'a1',
        },
      ]).pipe(Effect.provide(s.layer));
      const unsubscribe = yield* s.hydrate;
      const [row] = s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory;
      assert.deepStrictEqual<unknown>(
        [row.archived, row.lastPromptTime, row._meta],
        [true, '2026-01-01T00:00:00.000Z', { jetbrains: { air: { model: 'm' } } }],
      );
      updateHarnessSnapshot(s.registry, CODEX, current => ({
        ...current,
        sessionHistory: current.sessionHistory.map(entry => ({ ...entry, title: 'Renamed' })),
      }));
      yield* s.settle;
      const stored = yield* readTrackedSessions(codex).pipe(Effect.provide(s.layer));
      assert.deepStrictEqual<unknown>(trackedSessionRows(stored)[0], {
        _meta: { jetbrains: { air: { archived: true, lastPromptAt: '2026-01-01T00:00:00.000Z', model: 'm' } } },
        cwd: '/a',
        sessionId: 'a1',
        title: 'Renamed',
      });
      unsubscribe();
    }).pipe(Effect.scoped),
  );

  it.effect('unsubscribe stops persistence', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* addProject('/a').pipe(Effect.provide(s.layer));
      const unsubscribe = yield* s.hydrate;
      s.setHistory([{ cwd: '/a', sessionId: 'a1' }]);
      yield* s.settle;
      assert.deepStrictEqual(yield* s.indexed(codex), ['a1']);
      unsubscribe();
      s.setHistory([{ cwd: '/a', sessionId: 'a2' }]);
      yield* s.settle;
      assert.deepStrictEqual(yield* s.indexed(codex), ['a1']);
    }).pipe(Effect.scoped),
  );

  it.effect('a launch target whose tracked sessions read failed never persists', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* addProject('/a').pipe(Effect.provide(s.layer));
      const badFile = yield* trackedSessionsPath(claude).pipe(Effect.provide(s.layer));
      s.store.set(badFile, { kind: 'dir' });
      const unsubscribe = yield* s.hydrate;
      // With the blocker gone, a snapshot change still writes nothing.
      s.store.delete(badFile);
      updateHarnessSnapshot(s.registry, CLAUDE, current => ({
        ...current,
        sessionHistory: [{ cwd: '/a', sessionId: 'c2' }],
      }));
      yield* s.settle;
      assert.isUndefined(s.store.get(badFile));
      unsubscribe();
    }).pipe(Effect.scoped),
  );
});
