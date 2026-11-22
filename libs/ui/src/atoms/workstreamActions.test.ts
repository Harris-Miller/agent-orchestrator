/** Workstreams: the visibility rule on Sessions Page lists, adopt/orphan, and the archive cascade. */
import { assert, describe, layer } from '@effect/vitest';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';
import { beforeEach } from 'vitest';

import { advertise, CODEX, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { unifiedSessionHistoryAtom } from './backendState.atoms.ts';
import { listedSessionHistoryAtom, visibleListedSessionHistoryAtom } from './listedCwds.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { discardVirtual, ensureVirtual, virtualSessionAtom } from './virtualSession.atoms.ts';
import { projectsAtom } from './projects.atoms.ts';
import { groupAndSortSessionsForNav } from '../host/groupAndSortSessionsForNav.ts';
import { userSettingsDocumentAtom, workstreamsEnabledAtom } from './userSettings/userSettingsDocument.atoms.ts';
import { createWorkstreamIn, deleteWorkstreamIn, setWorkstreamArchivedIn } from './workstreamActions.ts';
import {
  adoptIntoWorkstream,
  orphanFromWorkstream,
  pendingWorkstreamAtom,
  workstreamsAtom,
  workstreamsLoadedAtom,
} from './workstreams.atoms.ts';
import { AsyncResult } from 'effect/reactivity';

const store = new Map<string, MapFsEntry>();
const testLayer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));

const setup = Effect.fnUntraced(function* (flag: boolean) {
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
  return { registry, ids };
});

const a = { launchTarget: 'codex-acp' as const, sessionId: 'a' };
const b = { launchTarget: 'codex-acp' as const, sessionId: 'b' };

describe('Workstreams visibility on the Sessions Page', () => {
  beforeEach(() => {
    store.clear();
  });
  layer(testLayer)(it => {
    it.effect('flag on hides owned sessions from the lists; adopt and orphan move them between lists', () =>
      Effect.gen(function* () {
        const s = yield* setup(true);
        const ws = yield* createWorkstreamIn(s.registry, 'W', []);
        assert.deepStrictEqual(s.ids(visibleListedSessionHistoryAtom), ['a', 'b']);
        yield* adoptIntoWorkstream(s.registry, ws.id, a);
        assert.deepStrictEqual(s.ids(visibleListedSessionHistoryAtom), ['b']);
        assert.deepStrictEqual(s.ids(listedSessionHistoryAtom), ['b']);
        assert.deepStrictEqual(s.registry.get(workstreamsAtom)[0]?.sessions, [a]);
        yield* orphanFromWorkstream(s.registry, a);
        assert.deepStrictEqual(s.ids(visibleListedSessionHistoryAtom), ['a', 'b']);
      }).pipe(Effect.scoped),
    );

    it.effect('flag off shows owned sessions under their Project; ownership persists', () =>
      Effect.gen(function* () {
        const s = yield* setup(true);
        const ws = yield* createWorkstreamIn(s.registry, 'W', []);
        yield* adoptIntoWorkstream(s.registry, ws.id, a);
        s.registry.set(userSettingsDocumentAtom, AsyncResult.success({ workstreamsEnabled: false }));
        assert.isFalse(s.registry.get(workstreamsEnabledAtom));
        const groups = groupAndSortSessionsForNav(s.registry.get(visibleListedSessionHistoryAtom), ['/proj']);
        assert.deepStrictEqual(groups.flatMap(group => group.sessions.map(entry => entry.sessionId)).sort(), [
          'a',
          'b',
        ]);
        assert.deepStrictEqual(s.registry.get(workstreamsAtom)[0]?.sessions, [a]);
      }).pipe(Effect.scoped),
    );

    it.effect('deleting a Workstream returns its sessions to the lists', () =>
      Effect.gen(function* () {
        const s = yield* setup(true);
        const ws = yield* createWorkstreamIn(s.registry, 'W', []);
        yield* adoptIntoWorkstream(s.registry, ws.id, a);
        yield* deleteWorkstreamIn(s.registry, ws.id);
        assert.deepStrictEqual(s.ids(visibleListedSessionHistoryAtom), ['a', 'b']);
      }).pipe(Effect.scoped),
    );

    it.effect('archiving a Workstream archives its sessions; unarchiving restores them', () =>
      Effect.gen(function* () {
        const s = yield* setup(true);
        const ws = yield* createWorkstreamIn(s.registry, 'W', []);
        yield* adoptIntoWorkstream(s.registry, ws.id, a);
        yield* adoptIntoWorkstream(s.registry, ws.id, b);
        const archived = () => s.registry.get(unifiedSessionHistoryAtom).map(entry => entry.archived === true);
        yield* setWorkstreamArchivedIn(s.registry, ws.id, true);
        assert.isTrue(s.registry.get(workstreamsAtom)[0]?.archived);
        assert.deepStrictEqual(archived(), [true, true]);
        yield* setWorkstreamArchivedIn(s.registry, ws.id, false);
        assert.isFalse(s.registry.get(workstreamsAtom)[0]?.archived);
        assert.deepStrictEqual(archived(), [false, false]);
      }).pipe(Effect.scoped),
    );

    it.effect('deleting a session drops it from its Workstream', () =>
      Effect.gen(function* () {
        const s = yield* setup(true);
        const ws = yield* createWorkstreamIn(s.registry, 'W', []);
        yield* adoptIntoWorkstream(s.registry, ws.id, a);
        yield* orphanFromWorkstream(s.registry, a);
        assert.deepStrictEqual(s.registry.get(workstreamsAtom)[0]?.sessions, []);
      }).pipe(Effect.scoped),
    );

    it.effect('a pending Workstream join is cleared when its draft is discarded or replaced', () =>
      Effect.gen(function* () {
        const s = yield* setup(true);
        yield* ensureVirtual(s.registry, { cwd: '/proj' });
        const blob = s.registry.get(virtualSessionAtom);
        assert.isNotNull(blob);
        s.registry.set(pendingWorkstreamAtom, { blobId: blob?.id ?? '', workstreamId: 'w' });
        yield* discardVirtual(s.registry);
        assert.isNull(s.registry.get(pendingWorkstreamAtom));
        yield* ensureVirtual(s.registry, { cwd: '/proj' });
        s.registry.set(pendingWorkstreamAtom, { blobId: 'some-other-blob', workstreamId: 'w' });
        yield* discardVirtual(s.registry);
        assert.isNull(s.registry.get(pendingWorkstreamAtom));
      }).pipe(Effect.scoped),
    );
  });
});
