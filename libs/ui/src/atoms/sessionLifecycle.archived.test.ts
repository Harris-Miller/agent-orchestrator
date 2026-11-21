/** Archived History entries: activating one unarchives it first; Archive flips the app-owned flag locally, agent-side calls are best-effort. */
import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Fiber } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { backendHarnessSnapshotAtom, selectedAtom, selectedSessionLaunchTargetAtom } from './backendState.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { advertise, CODEX, connectFakeAgent, freshRegistry, gated, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.testing.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

const advertisesArchive = {
  _meta: { jetbrains: { air: { capabilities: ['sessionIndex', 'sessionArchive'], version: 1 } } },
};

const makeAtoms = () => {
  const runtime = createHostRuntime(mockHostLayer);
  return createSessionLifecycleAtoms(runtime, () => Effect.void);
};

const setup = Effect.fnUntraced(function* (
  initializeResult: unknown,
  options: { readonly archived: boolean; readonly fake?: FakeAgentOpts; readonly status?: 'active' | 'inactive' },
) {
  const calls: string[] = [];
  const registry = yield* freshRegistry;
  yield* installFakeAgent(calls, options.fake);
  const atoms = makeAtoms();
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [
      { cwd: '/proj', sessionId: 's1', title: 'Old', ...(options.archived ? { archived: true as const } : {}) },
    ],
    sessions: { s1: { ...initialSessionSnapshot('s1', options.status ?? 'inactive'), cwd: '/proj' } },
  }));
  advertise(registry, CODEX, initializeResult);
  const snapshot = () => registry.get(backendHarnessSnapshotAtom(CODEX));
  const row = () => snapshot().sessionHistory.find(entry => entry.sessionId === 's1');
  const target = { launchTarget: CODEX, sessionId: 's1' };
  return { atoms, calls, registry, row, snapshot, target };
});

describe('Activating an archived History entry', () => {
  it.effect('keeps selection resolvable while an archived entry is unarchiving', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      const gate = yield* gated;
      yield* connectFakeAgent(CODEX, { sessionUnarchive: () => gate.during });
      const atoms = makeAtoms();
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [{ archived: true, cwd: '/proj', sessionId: 's1' }],
        sessions: { s1: { ...initialSessionSnapshot('s1', 'inactive'), cwd: '/proj' } },
      }));
      advertise(registry, CODEX, advertisesArchive);
      const activation = yield* Effect.forkChild(
        runAtomFn(registry, atoms.activateSessionAtomFn, { launchTarget: CODEX, sessionId: 's1' }),
      );
      yield* gate.started;
      assert.isUndefined(registry.get(selectedAtom));
      yield* gate.release;
      yield* Fiber.join(activation);
      assert.strictEqual(registry.get(selectedSessionLaunchTargetAtom), CODEX);
    }).pipe(Effect.scoped),
  );

  it.effect('unarchives, then loads; the row ends up unarchived', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: true });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['unarchive:s1', 'load:s1']);
      assert.isFalse(s.row()?.archived === true);
      assert.strictEqual(s.snapshot().sessions.s1.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('without sessionArchive the flag flips locally, no RPC, and the session loads', () =>
    Effect.gen(function* () {
      const s = yield* setup({}, { archived: true });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['load:s1']);
      assert.isFalse(s.row()?.archived === true);
    }).pipe(Effect.scoped),
  );

  it.effect('a failing agent unarchive is best-effort: the row is unarchived and the session still loads', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: true, fake: { failUnarchive: true } });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['unarchive:s1', 'load:s1']);
      assert.isFalse(s.row()?.archived === true);
      assert.strictEqual(s.snapshot().sessions.s1.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('keeps the row unarchived when the load fails after the unarchive', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: true, fake: { failLoad: true } });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['unarchive:s1', 'load:s1']);
      assert.isFalse(s.row()?.archived === true);
      assert.strictEqual(s.snapshot().sessions.s1.status, 'inactive');
    }).pipe(Effect.scoped),
  );

  it.effect('unarchives an already-active row (archived elsewhere) without a second load', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: true, status: 'active' });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['unarchive:s1']);
      assert.isFalse(s.row()?.archived === true);
      assert.strictEqual(s.snapshot().sessions.s1.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('an unarchived row loads without an unarchive', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: false });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['load:s1']);
    }).pipe(Effect.scoped),
  );
});

describe('Archive', () => {
  it.effect('marks the row archived in place, drops the session snapshot and clears Selected', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: false });
      s.registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
      yield* runAtomFn(s.registry, s.atoms.archiveSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['archive:s1']);
      assert.strictEqual(s.row()?.title, 'Old');
      assert.isTrue(s.row()?.archived === true);
      assert.notProperty(s.snapshot().sessions, 's1');
      assert.isUndefined(s.registry.get(selectedAtom));
    }).pipe(Effect.scoped),
  );

  it.effect('without sessionArchive the flag still flips locally and no RPC is sent', () =>
    Effect.gen(function* () {
      const s = yield* setup({}, { archived: false });
      yield* runAtomFn(s.registry, s.atoms.archiveSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, []);
      assert.isTrue(s.row()?.archived === true);
    }).pipe(Effect.scoped),
  );

  it.effect('a failing _session/archive is raised but the flag stays flipped', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: false, fake: { failArchive: true } });
      const exit = yield* Effect.exit(runAtomFn(s.registry, s.atoms.archiveSessionAtomFn, s.target));
      assert.isTrue(Exit.isFailure(exit));
      assert.isTrue(s.row()?.archived === true);
    }).pipe(Effect.scoped),
  );
});

describe('Bulk archive / unarchive', () => {
  const targets = ['s1', 's2', 's3'].map(sessionId => ({ launchTarget: CODEX, sessionId }));

  const setupMany = Effect.fnUntraced(function* (options: {
    readonly archived: boolean;
    readonly failArchiveFor?: string;
    readonly fake?: FakeAgentOpts;
  }) {
    const archiveCalls: string[] = [];
    const registry = yield* freshRegistry;
    yield* connectFakeAgent(CODEX, {
      ...options.fake,
      sessionArchive: ({ sessionId }: { sessionId: string }) => {
        archiveCalls.push(sessionId);
        return sessionId === options.failArchiveFor ? Effect.die('archive-fail') : Effect.void;
      },
      sessionUnarchive: () => Effect.void,
    });
    const atoms = makeAtoms();
    updateHarnessSnapshot(registry, CODEX, current => ({
      ...current,
      sessionHistory: targets.map(({ sessionId }) => ({
        cwd: '/proj',
        sessionId,
        ...(options.archived ? { archived: true as const } : {}),
      })),
    }));
    advertise(registry, CODEX, advertisesArchive);
    const archivedIds = () =>
      registry
        .get(backendHarnessSnapshotAtom(CODEX))
        .sessionHistory.filter(entry => entry.archived === true)
        .map(entry => entry.sessionId);
    return { archiveCalls, archivedIds, atoms, registry };
  });

  it.effect('archives every entry in order within one run', () =>
    Effect.gen(function* () {
      const s = yield* setupMany({ archived: false });
      yield* runAtomFn(s.registry, s.atoms.archiveSessionsAtomFn, targets);
      assert.deepStrictEqual(s.archiveCalls, ['s1', 's2', 's3']);
      assert.deepStrictEqual(s.archivedIds(), ['s1', 's2', 's3']);
    }).pipe(Effect.scoped),
  );

  it.effect('continues past a failing entry, then fails the run', () =>
    Effect.gen(function* () {
      const s = yield* setupMany({ archived: false, failArchiveFor: 's2' });
      const exit = yield* Effect.exit(runAtomFn(s.registry, s.atoms.archiveSessionsAtomFn, targets));
      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(s.archiveCalls, ['s1', 's2', 's3']);
      // The flag flips even for the entry whose agent-side call failed.
      assert.deepStrictEqual(s.archivedIds(), ['s1', 's2', 's3']);
    }).pipe(Effect.scoped),
  );

  it.effect('unarchives every entry without selecting or activating any', () =>
    Effect.gen(function* () {
      const s = yield* setupMany({ archived: true });
      yield* runAtomFn(s.registry, s.atoms.unarchiveSessionsAtomFn, targets);
      assert.deepStrictEqual(s.archivedIds(), []);
      assert.isUndefined(s.registry.get(selectedAtom));
      assert.notProperty(s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions, 's1');
    }).pipe(Effect.scoped),
  );

  it.effect('single unarchive does not open the session', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: true });
      yield* runAtomFn(s.registry, s.atoms.unarchiveSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['unarchive:s1']);
      assert.isFalse(s.row()?.archived === true);
      assert.isUndefined(s.registry.get(selectedAtom));
    }).pipe(Effect.scoped),
  );
});
