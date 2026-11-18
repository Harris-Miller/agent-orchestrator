/** Archived History entries: activating one unarchives it first; Archive marks the row in place. */
import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit, Fiber } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { AgentCapabilityMissing } from '../host/agentCapabilities.ts';
import { isArchivedEntry } from '../host/airMeta.ts';

import { backendHarnessSnapshotAtom, selectedAtom, selectedSessionLaunchTargetAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import type { FakeAgentOpts } from './fakeAgent.testing.ts';
import { advertise, CODEX, connectFakeAgent, freshRegistry, gated, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';

const advertisesArchive = {
  _meta: { jetbrains: { air: { capabilities: ['sessionIndex', 'sessionArchive'], version: 1 } } },
};

const archivedMeta = { jetbrains: { air: { archived: true, version: 1 } } };

const makeAtoms = () => {
  const runtime = createHostRuntime(mockHostLayer);
  const { cancelPromptAtomFn } = createChatAtoms(runtime);
  return createSessionLifecycleAtoms(runtime, cancelPromptAtomFn);
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
      { cwd: '/proj', sessionId: 's1', title: 'Old', ...(options.archived ? { _meta: archivedMeta } : {}) },
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
        sessionHistory: [{ cwd: '/proj', sessionId: 's1', _meta: archivedMeta }],
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
      assert.isFalse(isArchivedEntry(s.row() ?? {}));
      assert.strictEqual(s.snapshot().sessions.s1.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('is refused without sessionArchive: no RPC, row still archived', () =>
    Effect.gen(function* () {
      const s = yield* setup({}, { archived: true });
      const error = yield* Effect.flip(runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target));
      assert.instanceOf(error, AgentCapabilityMissing);
      assert.strictEqual(error.capability, 'sessionArchive');
      assert.deepStrictEqual(s.calls, []);
      assert.isTrue(isArchivedEntry(s.row() ?? {}));
    }).pipe(Effect.scoped),
  );

  it.effect('sends no load when the unarchive fails; the session is inactive with a defect', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: true, fake: { failUnarchive: true } });
      const exit = yield* Effect.exit(runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target));
      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(s.calls, ['unarchive:s1']);
      assert.isTrue(isArchivedEntry(s.row() ?? {}));
      assert.strictEqual(s.snapshot().sessions.s1.status, 'inactive');
      assert.isNotEmpty(s.snapshot().sessions.s1.defects ?? []);
    }).pipe(Effect.scoped),
  );

  it.effect('reports unarchive failure for a history-only entry without loading or selecting it', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: true, fake: { failUnarchive: true } });
      updateHarnessSnapshot(s.registry, CODEX, current => ({ ...current, sessions: {} }));
      const exit = yield* Effect.exit(runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target));
      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(s.calls, ['unarchive:s1']);
      assert.isUndefined(s.registry.get(selectedAtom));
      assert.isTrue(isArchivedEntry(s.row() ?? {}));
    }).pipe(Effect.scoped),
  );

  it.effect('keeps the row unarchived when the load fails after the unarchive', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: true, fake: { failLoad: true } });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['unarchive:s1', 'load:s1']);
      assert.isFalse(isArchivedEntry(s.row() ?? {}));
      assert.strictEqual(s.snapshot().sessions.s1.status, 'inactive');
    }).pipe(Effect.scoped),
  );

  it.effect('unarchives an already-active row (archived elsewhere) without a second load', () =>
    Effect.gen(function* () {
      const s = yield* setup(advertisesArchive, { archived: true, status: 'active' });
      yield* runAtomFn(s.registry, s.atoms.activateSessionAtomFn, s.target);
      assert.deepStrictEqual(s.calls, ['unarchive:s1']);
      assert.isFalse(isArchivedEntry(s.row() ?? {}));
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
      assert.isTrue(isArchivedEntry(s.row() ?? {}));
      assert.notProperty(s.snapshot().sessions, 's1');
      assert.isUndefined(s.registry.get(selectedAtom));
    }).pipe(Effect.scoped),
  );

  it.effect('a list finishing during _session/archive does not bring back a stale snapshot', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      const gate = yield* gated;
      yield* connectFakeAgent(CODEX, {
        agent: {
          'session/list': () =>
            Effect.succeed({
              sessions: [
                { cwd: '/proj', sessionId: 's1', title: 'Old' },
                { cwd: '/proj', sessionId: 's2', title: 'Listed meanwhile' },
              ],
            }),
        },
        sessionArchive: () => gate.during,
      });
      const atoms = makeAtoms();
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [{ cwd: '/proj', sessionId: 's1', title: 'Old' }],
        sessions: { s1: { ...initialSessionSnapshot('s1', 'active'), cwd: '/proj' } },
      }));
      advertise(registry, CODEX, advertisesArchive);

      const archiving = yield* Effect.forkChild(
        runAtomFn(registry, atoms.archiveSessionAtomFn, { launchTarget: CODEX, sessionId: 's1' }),
      );
      yield* gate.started;
      yield* runAtomFn(registry, atoms.refreshAllSessionHistoriesAtomFn, undefined);
      yield* gate.release;
      yield* Fiber.join(archiving);

      const snapshot = registry.get(backendHarnessSnapshotAtom(CODEX));
      assert.deepStrictEqual(
        snapshot.sessionHistory.map(entry => [entry.sessionId, isArchivedEntry(entry)]),
        [
          ['s1', true],
          ['s2', false],
        ],
      );
      assert.notProperty(snapshot.sessions, 's1');
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
        ...(options.archived ? { _meta: archivedMeta } : {}),
      })),
    }));
    advertise(registry, CODEX, advertisesArchive);
    const archivedIds = () =>
      registry
        .get(backendHarnessSnapshotAtom(CODEX))
        .sessionHistory.filter(entry => isArchivedEntry(entry))
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
      assert.deepStrictEqual(s.archivedIds(), ['s1', 's3']);
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
      assert.isFalse(isArchivedEntry(s.row() ?? {}));
      assert.isUndefined(s.registry.get(selectedAtom));
    }).pipe(Effect.scoped),
  );
});
