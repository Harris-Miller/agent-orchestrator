import { assert, describe, it } from '@effect/vitest';
import { addProject, removeTrackedSession, trackedSessionsPath, upsertTrackedSessions } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';
import { TestClock } from 'effect/testing';

import type { HistoryEntry } from '../host/acpSessionBootstrap.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { CODEX, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { hydrateHarnessCaches } from './harnessHydration.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { reconcileExternalTracked, settleTrackedSessionWrites, TRACKED_SESSIONS_POLL_MS } from './trackedSessions.ts';

const codex = toLaunchTarget(CODEX);
const row = (sessionId: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  cwd: '/a',
  sessionId,
  ...extra,
});
const json = (r: HistoryEntry) =>
  JSON.stringify({ cwd: r.cwd, sessionId: r.sessionId, ...(r.title === undefined ? {} : { title: r.title }) });

describe('reconcileExternalTracked', () => {
  const scope = new Set(['/a']);
  it('adds a record unknown to memory and lastWritten', () => {
    const out = reconcileExternalTracked([row('s1')], [], new Map(), scope);
    assert.deepStrictEqual(
      out.upserts.map(r => r.sessionId),
      ['s1'],
    );
  });
  it('updates a record that differs from lastWritten', () => {
    const mem = row('s1', { title: 'old' });
    const out = reconcileExternalTracked([row('s1', { title: 'new' })], [mem], new Map([['s1', json(mem)]]), scope);
    assert.strictEqual(out.upserts[0]?.title, 'new');
  });
  it('skips a record equal to lastWritten (pending local edit is not reverted)', () => {
    const file = row('s1', { title: 'old' });
    const out = reconcileExternalTracked([file], [row('s1', { title: 'local' })], new Map([['s1', json(file)]]), scope);
    assert.deepStrictEqual(out, { removals: [], upserts: [] });
  });
  it('removes an in-scope row known to lastWritten but absent from the file', () => {
    const out = reconcileExternalTracked([], [row('s1')], new Map([['s1', json(row('s1'))]]), scope);
    assert.deepStrictEqual(out.removals, ['s1']);
  });
  it('keeps a pending local create (unknown to lastWritten)', () => {
    assert.deepStrictEqual(reconcileExternalTracked([], [row('s1')], new Map(), scope).removals, []);
  });
  it('never removes out-of-scope rows (dormant after Stop tracking)', () => {
    const other = row('s2', { cwd: '/b' });
    const out = reconcileExternalTracked([], [other], new Map([['s2', json(other)]]), scope);
    assert.deepStrictEqual(out.removals, []);
  });
});

const setup = Effect.fnUntraced(function* () {
  const store = new Map<string, MapFsEntry>();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
  const registry = yield* freshRegistry;
  const calls: string[] = [];
  yield* installFakeAgent(calls);
  yield* addProject('/a').pipe(Effect.provide(layer));
  const unsubscribe = yield* hydrateHarnessCaches(registry).pipe(Effect.provide(layer));
  const ids = () => registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory.map(r => r.sessionId);
  const external = (records: readonly { cwd: string; sessionId: string; title?: string; _meta?: object }[]) =>
    upsertTrackedSessions(codex, records).pipe(Effect.provide(layer));
  const flush = Effect.gen(function* () {
    for (let i = 0; i < 20; i += 1) yield* Effect.yieldNow;
  });
  const tick = Effect.gen(function* () {
    yield* flush;
    yield* TestClock.adjust(TRACKED_SESSIONS_POLL_MS);
    yield* flush;
    yield* Effect.promise(settleTrackedSessionWrites);
    yield* flush;
  });
  const file = trackedSessionsPath(codex).pipe(Effect.provide(layer));
  return { calls, external, file, ids, layer, registry, store, tick, unsubscribe };
});

describe('startTrackedSessionsWatch', () => {
  it.effect('shows a session written by another instance, then its title and archive flag', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* s.external([{ cwd: '/a', sessionId: 'x1', title: 'one' }]);
      yield* s.tick;
      assert.deepStrictEqual(s.ids(), ['x1']);
      yield* s.external([{ _meta: { archived: true }, cwd: '/a', sessionId: 'x1', title: 'two' }]);
      yield* s.tick;
      const rows = s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory;
      assert.strictEqual(rows[0]?.title, 'two');
      assert.strictEqual(rows.length, 1);
      s.unsubscribe();
    }),
  );

  it.effect('ignores records of cwds not in scope', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* s.external([{ cwd: '/zzz', sessionId: 'z1' }]);
      yield* s.tick;
      assert.deepStrictEqual(s.ids(), []);
      s.unsubscribe();
    }),
  );

  it.effect('removes a session Deleted elsewhere and clears Selected; no ACP calls, no write-back', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* s.external([{ cwd: '/a', sessionId: 'x1' }]);
      yield* s.tick;
      s.registry.set(selectedAtom, { _tag: 'Session', launchTarget: CODEX, sessionId: 'x1' } as never);
      const before = s.store.get(yield* s.file);
      yield* removeTrackedSession(codex, '/a', 'x1').pipe(Effect.provide(s.layer));
      yield* s.tick;
      assert.deepStrictEqual(s.ids(), []);
      assert.isUndefined(s.registry.get(selectedAtom));
      assert.deepStrictEqual(s.calls, []);
      // The removal came from the other instance; applying it wrote nothing further.
      const after = s.store.get(yield* s.file);
      assert.notDeepEqual(after, before);
      yield* s.tick;
      assert.deepStrictEqual(s.store.get(yield* s.file), after);
      s.unsubscribe();
    }),
  );

  it.effect('ignores a malformed file, keeps rows, then recovers', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* s.external([{ cwd: '/a', sessionId: 'x1' }]);
      yield* s.tick;
      const path = yield* s.file;
      s.store.set(path, { content: '{"cwds":', kind: 'file' });
      yield* s.tick;
      assert.deepStrictEqual(s.ids(), ['x1']);
      s.store.set(path, {
        content: '{"cwds":{"/a":[{"cwd":"/a","sessionId":"x2"},{"cwd":"/a","sessionId":"x1"}]}}',
        kind: 'file',
      });
      yield* s.tick;
      assert.sameMembers(s.ids(), ['x1', 'x2']);
      s.unsubscribe();
    }),
  );

  it.effect('does not rewrite the file after applying an external change', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* s.external([{ cwd: '/a', sessionId: 'x1' }]);
      const path = yield* s.file;
      const written = s.store.get(path);
      yield* s.tick;
      yield* s.tick;
      assert.deepStrictEqual(s.store.get(path), written);
      assert.deepStrictEqual(s.ids(), ['x1']);
      s.unsubscribe();
    }),
  );
});
