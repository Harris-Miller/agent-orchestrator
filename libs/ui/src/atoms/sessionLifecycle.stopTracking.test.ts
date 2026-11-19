/** Stop tracking a Project: close its active sessions, never block on a failed close, reset Selected, drop the Project. */
import { assert, describe, it } from '@effect/vitest';
import { addProject, pinSession, readProjects, readSessionIndex, updateSessionIndex } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Exit, Layer } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { createChatAtoms } from './chat.atoms.ts';
import { advertise, CODEX, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { pinnedSessionsAtom } from './pinnedSessions.atoms.ts';
import { projectMembershipAtom, projectsAtom, projectsLoadedAtom } from './projects.atoms.ts';
import { runAtomFn } from './runAtomFn.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import {
  bindVirtualOnUsable,
  ensureVirtual,
  setVirtualLaunchTarget,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

const target = toLaunchTarget(CODEX);

const setup = Effect.fnUntraced(function* (options: {
  readonly failClose?: boolean;
  readonly advertiseClose?: boolean;
}) {
  const store = new Map<string, MapFsEntry>();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
  const runtime = createHostRuntime(layer);
  const { cancelPromptAtomFn } = createChatAtoms(runtime);
  const atoms = createSessionLifecycleAtoms(runtime, cancelPromptAtomFn);
  const calls: string[] = [];
  const registry = yield* freshRegistry;
  yield* installFakeAgent(calls, { failClose: options.failClose });
  advertise(
    registry,
    CODEX,
    options.advertiseClose === true ? { agentCapabilities: { sessionCapabilities: { close: {} } } } : {},
  );
  yield* addProject('/proj').pipe(Effect.provide(layer));
  yield* addProject('/keep').pipe(Effect.provide(layer));
  registry.set(projectsAtom, ['/proj', '/keep']);
  registry.set(projectsLoadedAtom, true);
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [
      { cwd: '/proj', sessionId: 'live' },
      { cwd: '/proj', sessionId: 'idle' },
      { cwd: '/keep', sessionId: 'kept' },
    ],
    sessions: {
      idle: { ...initialSessionSnapshot('idle', 'inactive'), cwd: '/proj' },
      kept: { ...initialSessionSnapshot('kept', 'active'), cwd: '/keep' },
      live: { ...initialSessionSnapshot('live', 'active'), cwd: '/proj' },
    },
  }));
  yield* updateSessionIndex(
    target,
    { '/keep': [{ cwd: '/keep', sessionId: 'kept' }], '/proj': [{ cwd: '/proj', sessionId: 'live' }] },
    new Set(),
  ).pipe(Effect.provide(layer));
  const pins = yield* pinSession(target, { cwd: '/proj', sessionId: 'live' }).pipe(Effect.provide(layer));
  registry.set(pinnedSessionsAtom(CODEX), pins.pinned);
  const stop = runAtomFn(registry, atoms.stopTrackingProjectAtomFn, '/proj');
  const rows = () =>
    registry
      .get(backendHarnessSnapshotAtom(CODEX))
      .sessionHistory.map(entry => entry.sessionId)
      .toSorted();
  return { calls, layer, registry, rows, stop };
});

describe('Stop tracking a Project', () => {
  it.effect('counts only active sessions of the Project', () =>
    Effect.gen(function* () {
      const s = yield* setup({});
      assert.deepStrictEqual(s.registry.get(projectMembershipAtom('/proj')).activeSessions, [
        { launchTarget: CODEX, sessionId: 'live' },
      ]);
      assert.deepStrictEqual(s.registry.get(projectMembershipAtom('/empty')).activeSessions, []);
    }).pipe(Effect.scoped),
  );

  it.effect(
    'closes the active sessions, removes the Project, its rows and index entries, keeps pins and other Projects',
    () =>
      Effect.gen(function* () {
        const s = yield* setup({});
        yield* s.stop;
        assert.deepStrictEqual(s.calls, ['close:live']);
        assert.deepStrictEqual(s.registry.get(projectsAtom), ['/keep']);
        assert.deepStrictEqual((yield* readProjects().pipe(Effect.provide(s.layer))).projects, ['/keep']);
        assert.deepStrictEqual(s.rows(), ['kept']);
        assert.deepStrictEqual(Object.keys((yield* readSessionIndex(target).pipe(Effect.provide(s.layer))).cwds), [
          '/keep',
        ]);
        assert.deepStrictEqual(
          s.registry.get(pinnedSessionsAtom(CODEX)).map(pin => pin.sessionId),
          ['live'],
        );
        assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.kept?.status, 'active');
      }).pipe(Effect.scoped),
  );

  it.effect('a Project with no active sessions stops without closing anything', () =>
    Effect.gen(function* () {
      const s = yield* setup({});
      updateHarnessSnapshot(s.registry, CODEX, current => ({
        ...current,
        sessions: { ...current.sessions, live: { ...initialSessionSnapshot('live', 'inactive'), cwd: '/proj' } },
      }));
      yield* s.stop;
      assert.deepStrictEqual(s.calls, []);
      assert.deepStrictEqual(s.registry.get(projectsAtom), ['/keep']);
    }).pipe(Effect.scoped),
  );

  it.effect(
    'an unadvertised close is best-effort: its failure is ignored and the session is marked inactive locally',
    () =>
      Effect.gen(function* () {
        const s = yield* setup({ failClose: true });
        yield* s.stop;
        assert.strictEqual(s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.live?.status, 'inactive');
        assert.deepStrictEqual(s.registry.get(projectsAtom), ['/keep']);
      }).pipe(Effect.scoped),
  );

  it.effect('a failing advertised close surfaces as an error but does not block the stop', () =>
    Effect.gen(function* () {
      const s = yield* setup({ advertiseClose: true, failClose: true });
      const exit = yield* Effect.exit(s.stop);
      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(s.registry.get(projectsAtom), ['/keep']);
      assert.deepStrictEqual(s.rows(), ['kept']);
    }).pipe(Effect.scoped),
  );

  it.effect('resets Selected to a fresh Virtual draft when the Selected session belonged to the Project', () =>
    Effect.gen(function* () {
      const s = yield* setup({});
      s.registry.set(selectedAtom, { _tag: 'Session', sessionId: 'idle' });
      yield* s.stop;
      assert.deepStrictEqual(s.registry.get(selectedAtom), { _tag: 'Virtual' });
      assert.isNotNull(s.registry.get(virtualSessionAtom));
    }).pipe(Effect.scoped),
  );

  it.effect('leaves Selected alone when it belongs to another Project', () =>
    Effect.gen(function* () {
      const s = yield* setup({});
      s.registry.set(selectedAtom, { _tag: 'Session', sessionId: 'kept' });
      yield* s.stop;
      assert.deepStrictEqual(s.registry.get(selectedAtom), { _tag: 'Session', sessionId: 'kept' });
    }).pipe(Effect.scoped),
  );

  it.effect('keeps an unrelated Virtual draft and re-selects it when Selected belonged to the Project', () =>
    Effect.gen(function* () {
      const s = yield* setup({});
      yield* ensureVirtual(s.registry, { cwd: '/keep' });
      const draft = s.registry.get(virtualSessionAtom);
      s.registry.set(selectedAtom, { _tag: 'Session', sessionId: 'idle' });
      yield* s.stop;
      assert.deepStrictEqual(s.registry.get(selectedAtom), { _tag: 'Virtual' });
      assert.strictEqual(s.registry.get(virtualSessionAtom)?.id, draft?.id);
    }).pipe(Effect.scoped),
  );

  it.effect('leaves a Virtual draft with no Bound session untouched, even on the stopped Project cwd', () =>
    Effect.gen(function* () {
      const s = yield* setup({});
      yield* ensureVirtual(s.registry, { cwd: '/proj' });
      const draft = s.registry.get(virtualSessionAtom);
      yield* s.stop;
      assert.strictEqual(s.registry.get(virtualSessionAtom)?.id, draft?.id);
      assert.deepStrictEqual(s.registry.get(selectedAtom), { _tag: 'Virtual' });
    }).pipe(Effect.scoped),
  );

  it.effect('closes a Bound Virtual by its snapshot cwd, once', () =>
    Effect.gen(function* () {
      const s = yield* setup({});
      yield* ensureVirtual(s.registry, { cwd: '/keep' });
      yield* setVirtualLaunchTarget(s.registry, CODEX);
      yield* bindVirtualOnUsable(s.registry, CODEX);
      const boundId = s.registry.get(virtualSessionAtom)?.sessionId;
      assert.isDefined(boundId);
      // The Bound session's snapshot cwd diverges from the Virtual blob's own cwd ('/keep').
      updateHarnessSnapshot(s.registry, CODEX, current => ({
        ...current,
        sessions: { ...current.sessions, [boundId]: { ...current.sessions[boundId], cwd: '/proj' } },
      }));
      const membership = s.registry.get(projectMembershipAtom('/proj'));
      assert.isTrue(membership.virtualBoundInProject);
      assert.sameMembers(
        membership.activeSessions.map(a => a.sessionId),
        ['live', boundId],
      );
      yield* s.stop;
      // Everything the dialog counted is closed, the Bound one exactly once (via the Virtual discard).
      assert.strictEqual(s.calls.filter(call => call === 'close:live').length, 1);
      assert.strictEqual(s.calls.filter(call => call === `close:${boundId}`).length, 1);
      assert.isUndefined(s.registry.get(virtualSessionAtom)?.sessionId);
      assert.deepStrictEqual(s.registry.get(selectedAtom), { _tag: 'Virtual' });
    }).pipe(Effect.scoped),
  );
});
