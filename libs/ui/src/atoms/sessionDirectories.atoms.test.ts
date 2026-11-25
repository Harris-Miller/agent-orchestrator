/** Editing a session's Additional directories: the record changes, a live session is untouched, the next activation sends the edit. */
import { resolve } from 'node:path';

import { assert, describe, it } from '@effect/vitest';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { makeRecordingAnalytics, summarize } from '../analytics/recordingAnalytics.testing.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import type { SessionRequest } from './fakeAgent.testing.ts';
import { advertise, CODEX, enableProviders, freshRegistry, installFakeAgent } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.testing.ts';
import { createSessionDirectoriesAtoms, setSessionDirectories } from './sessionDirectories.atoms.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import { trackedRecordOf } from './trackedSessions.ts';

const W = resolve('/ws/app.code-workspace');
const [A, B, C, D] = [resolve('/ws/a'), resolve('/ws/b'), resolve('/ws/c'), resolve('/ws/d')];
const target = { launchTarget: CODEX, sessionId: 's1' };

const setup = Effect.fnUntraced(function* (options: { readonly active?: boolean } = {}) {
  const store = new Map<string, MapFsEntry>([
    [W, { content: JSON.stringify({ folders: [{ path: A }, { path: B }, { path: C }] }), kind: 'file' }],
  ]);
  const analytics = makeRecordingAnalytics();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store), analytics.layer);
  const calls: string[] = [];
  const requests: SessionRequest[] = [];
  const registry = yield* freshRegistry;
  enableProviders(registry, [CODEX]);
  yield* installFakeAgent(calls, { additionalDirectories: true, requests });
  advertise(registry, CODEX, { agentCapabilities: { sessionCapabilities: { additionalDirectories: {} } } });
  updateHarnessSnapshot(registry, CODEX, current => ({
    ...current,
    sessionHistory: [{ additionalDirectories: [B, C], cwd: A, sessionId: 's1', workspaceFile: W }],
    sessions: {
      s1: {
        ...initialSessionSnapshot('s1', options.active === true ? 'active' : 'inactive'),
        additionalDirectories: [B, C],
        cwd: A,
      },
    },
  }));
  const history = () => registry.get(backendHarnessSnapshotAtom(CODEX)).sessionHistory[0];
  const lifecycle = createSessionLifecycleAtoms(createHostRuntime(layer), () => Effect.void);
  const directories = createSessionDirectoriesAtoms(createHostRuntime(layer));
  return { analytics, calls, directories, history, layer, lifecycle, registry, requests };
});

describe('setSessionDirectories', () => {
  it.effect('marks the History row edited with the cleaned list, and the persisted record carries both', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const result = setSessionDirectories(s.registry, target, [D, 'relative', A, D, B]);
      assert.deepStrictEqual(result, { changed: true, count: 2 });
      assert.deepStrictEqual(
        [s.history().additionalDirectories, s.history().directoriesEdited, s.history().workspaceFile],
        [[D, B], true, W],
      );
      const record = trackedRecordOf(s.history());
      assert.deepStrictEqual([record.additionalDirectories, record.directoriesEdited], [[D, B], true]);
    }).pipe(Effect.scoped),
  );

  it.effect('changes nothing for an unchanged list or an untracked session', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      assert.deepStrictEqual(setSessionDirectories(s.registry, target, [C, B]), { changed: false, count: 2 });
      assert.isUndefined(s.history().directoriesEdited);
      assert.deepStrictEqual(setSessionDirectories(s.registry, { ...target, sessionId: 'nope' }, [D]), {
        changed: false,
        count: 0,
      });
    }).pipe(Effect.scoped),
  );

  it.effect('a live session is not torn down and keeps the list it started with', () =>
    Effect.gen(function* () {
      const s = yield* setup({ active: true });
      setSessionDirectories(s.registry, target, [D]);
      assert.deepStrictEqual(s.calls, []);
      const session = s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions.s1;
      assert.strictEqual(session.status, 'active');
      assert.deepStrictEqual(session.additionalDirectories, [B, C]);
      assert.deepStrictEqual(s.history().additionalDirectories, [D]);
    }).pipe(Effect.scoped),
  );

  it.effect('records one event with the count only, and only for a real change', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const { setSessionDirectoriesAtomFn } = s.directories;
      yield* runAtomFn(s.registry, setSessionDirectoriesAtomFn, { ...target, directories: [D] });
      yield* runAtomFn(s.registry, setSessionDirectoriesAtomFn, { ...target, directories: [D] });
      assert.deepStrictEqual(summarize(s.analytics.events), [
        { name: 'session_directories_changed', properties: { directory_count: 1 } },
      ]);
    }).pipe(Effect.scoped),
  );
});

describe('activating an edited session', () => {
  it.effect('sends the edited list, not the Workspace file’s folders, and keeps the stored cwd', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      setSessionDirectories(s.registry, target, [D]);
      yield* runAtomFn(s.registry, s.lifecycle.activateSessionAtomFn, target);
      assert.strictEqual(s.requests[0].params.cwd, A);
      assert.deepStrictEqual(s.requests[0].params.additionalDirectories, [D]);
    }).pipe(Effect.scoped),
  );

  it.effect('an emptied list stays empty: the file does not bring the folders back', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      setSessionDirectories(s.registry, target, []);
      yield* runAtomFn(s.registry, s.lifecycle.activateSessionAtomFn, target);
      assert.isFalse('additionalDirectories' in s.requests[0].params);
    }).pipe(Effect.scoped),
  );

  it.effect('an unedited session still follows its Workspace file', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* runAtomFn(s.registry, s.lifecycle.activateSessionAtomFn, target);
      assert.deepStrictEqual(s.requests[0].params.additionalDirectories, [B, C]);
    }).pipe(Effect.scoped),
  );
});
