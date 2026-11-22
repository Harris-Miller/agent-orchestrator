/** Workstreams: the visibility rule on Sessions Page lists, adopt/orphan, and the archive cascade. */
import { assert, describe, it } from '@effect/vitest';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';

import { advertise, CODEX, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { unifiedSessionHistoryAtom } from './backendState.atoms.ts';
import { listedSessionHistoryAtom, visibleListedSessionHistoryAtom } from './listedCwds.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { projectsAtom } from './projects.atoms.ts';
import { groupAndSortSessionsForNav } from '../host/groupAndSortSessionsForNav.ts';
import { userSettingsDocumentAtom, workstreamsEnabledAtom } from './userSettings/userSettingsDocument.atoms.ts';
import {
  adoptIntoWorkstream,
  createWorkstreamIn,
  deleteWorkstreamIn,
  orphanFromWorkstream,
  setWorkstreamArchivedIn,
} from './workstreamActions.ts';
import { removeSessionEverywhere, workstreamsAtom, workstreamsLoadedAtom } from './workstreams.atoms.ts';
import { AsyncResult } from 'effect/reactivity';

const setup = Effect.fnUntraced(function* (flag: boolean) {
  const store = new Map<string, MapFsEntry>();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
  const calls: string[] = [];
  const registry = yield* freshRegistry;
  yield* installFakeAgent(calls);
  advertise(registry, CODEX, {});
  registry.set(projectsAtom, ['/proj']);
  registry.set(workstreamsLoadedAtom, true);
  registry.set(userSettingsDocumentAtom, AsyncResult.success({ workstreamsEnabled: flag }));
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [
      { cwd: '/proj', sessionId: 'a' },
      { cwd: '/proj', sessionId: 'b' },
    ],
  }));
  const ids = (atom: typeof visibleListedSessionHistoryAtom) => registry.get(atom).map(entry => entry.sessionId);
  return { registry, layer, ids };
});

const a = { launchTarget: 'codex-acp' as const, sessionId: 'a' };
const b = { launchTarget: 'codex-acp' as const, sessionId: 'b' };

describe('Workstreams visibility on the Sessions Page', () => {
  it.effect('flag on hides owned sessions from the lists; adopt and orphan move them between lists', () =>
    Effect.gen(function* () {
      const s = yield* setup(true);
      const ws = yield* createWorkstreamIn(s.registry, 'W', []).pipe(Effect.provide(s.layer));
      assert.deepStrictEqual(s.ids(visibleListedSessionHistoryAtom), ['a', 'b']);
      yield* adoptIntoWorkstream(s.registry, ws.id, a).pipe(Effect.provide(s.layer));
      assert.deepStrictEqual(s.ids(visibleListedSessionHistoryAtom), ['b']);
      assert.deepStrictEqual(s.ids(listedSessionHistoryAtom), ['b']);
      assert.deepStrictEqual(s.registry.get(workstreamsAtom)[0]?.sessions, [a]);
      yield* orphanFromWorkstream(s.registry, a).pipe(Effect.provide(s.layer));
      assert.deepStrictEqual(s.ids(visibleListedSessionHistoryAtom), ['a', 'b']);
    }).pipe(Effect.scoped),
  );

  it.effect('flag off shows owned sessions under their Project; ownership persists', () =>
    Effect.gen(function* () {
      const s = yield* setup(true);
      const ws = yield* createWorkstreamIn(s.registry, 'W', []).pipe(Effect.provide(s.layer));
      yield* adoptIntoWorkstream(s.registry, ws.id, a).pipe(Effect.provide(s.layer));
      s.registry.set(userSettingsDocumentAtom, AsyncResult.success({ workstreamsEnabled: false }));
      assert.isFalse(s.registry.get(workstreamsEnabledAtom));
      const groups = groupAndSortSessionsForNav(s.registry.get(visibleListedSessionHistoryAtom), ['/proj']);
      assert.deepStrictEqual(groups.flatMap(group => group.sessions.map(entry => entry.sessionId)).sort(), ['a', 'b']);
      assert.deepStrictEqual(s.registry.get(workstreamsAtom)[0]?.sessions, [a]);
    }).pipe(Effect.scoped),
  );

  it.effect('deleting a Workstream returns its sessions to the lists', () =>
    Effect.gen(function* () {
      const s = yield* setup(true);
      const ws = yield* createWorkstreamIn(s.registry, 'W', []).pipe(Effect.provide(s.layer));
      yield* adoptIntoWorkstream(s.registry, ws.id, a).pipe(Effect.provide(s.layer));
      yield* deleteWorkstreamIn(s.registry, ws.id).pipe(Effect.provide(s.layer));
      assert.deepStrictEqual(s.ids(visibleListedSessionHistoryAtom), ['a', 'b']);
    }).pipe(Effect.scoped),
  );

  it.effect('archiving a Workstream archives its sessions; unarchiving restores them', () =>
    Effect.gen(function* () {
      const s = yield* setup(true);
      const ws = yield* createWorkstreamIn(s.registry, 'W', []).pipe(Effect.provide(s.layer));
      yield* adoptIntoWorkstream(s.registry, ws.id, a).pipe(Effect.provide(s.layer));
      yield* adoptIntoWorkstream(s.registry, ws.id, b).pipe(Effect.provide(s.layer));
      const archived = () => s.registry.get(unifiedSessionHistoryAtom).map(entry => entry.archived === true);
      yield* setWorkstreamArchivedIn(s.registry, ws.id, true).pipe(Effect.provide(s.layer));
      assert.isTrue(s.registry.get(workstreamsAtom)[0]?.archived);
      assert.deepStrictEqual(archived(), [true, true]);
      yield* setWorkstreamArchivedIn(s.registry, ws.id, false).pipe(Effect.provide(s.layer));
      assert.isFalse(s.registry.get(workstreamsAtom)[0]?.archived);
      assert.deepStrictEqual(archived(), [false, false]);
    }).pipe(Effect.scoped),
  );

  it.effect('deleting a session drops it from its Workstream', () =>
    Effect.gen(function* () {
      const s = yield* setup(true);
      const ws = yield* createWorkstreamIn(s.registry, 'W', []).pipe(Effect.provide(s.layer));
      yield* adoptIntoWorkstream(s.registry, ws.id, a).pipe(Effect.provide(s.layer));
      yield* removeSessionEverywhere(s.registry, a).pipe(Effect.provide(s.layer));
      assert.deepStrictEqual(s.registry.get(workstreamsAtom)[0]?.sessions, []);
    }).pipe(Effect.scoped),
  );
});
