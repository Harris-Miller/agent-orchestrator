/** A Workspace project is a virtual cwd: the Agent only ever receives its first folder as cwd, and sessions record the file. */
import { resolve } from 'node:path';

import { assert, describe, it } from '@effect/vitest';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';

import { createHostRuntime } from '../createHostRuntime.ts';
import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import type { SessionRequest } from './fakeAgent.testing.ts';
import { advertise, CODEX, enableProviders, freshRegistry, installFakeAgent, setPhase } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { runAtomFn } from './runAtomFn.testing.ts';
import { createSessionLifecycleAtoms } from './sessionLifecycle.atoms.ts';
import {
  bindVirtualOnUsable,
  ensureVirtual,
  selectVirtualProject,
  setVirtualLaunchTarget,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';
import { workspaceFilesAtom } from './workspaceFiles.atoms.ts';

const W = resolve('/ws/app.code-workspace');
const [A, B, C] = [resolve('/ws/a'), resolve('/ws/b'), resolve('/ws/c')];
const D = resolve('/dir/plain');

const setup = Effect.fnUntraced(function* () {
  const store = new Map<string, MapFsEntry>();
  const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
  const requests: SessionRequest[] = [];
  const registry = yield* freshRegistry;
  enableProviders(registry, [CODEX]);
  yield* installFakeAgent([], { additionalDirectories: true, requests });
  registry.set(workspaceFilesAtom, { [W]: { _tag: 'Resolved', folders: [A, B, C] } });
  const bind = Effect.gen(function* () {
    setPhase(registry, CODEX, 'connecting');
    yield* setVirtualLaunchTarget(registry, CODEX);
    setPhase(registry, CODEX, 'ready');
    yield* bindVirtualOnUsable(registry, CODEX);
  });
  return { bind, layer, registry, requests, store };
});

describe('creating a session in a Workspace project', () => {
  it.effect('sends the first folder as cwd and the rest as Additional directories, never the file path', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* ensureVirtual(s.registry, { project: W });
      yield* s.bind;
      assert.strictEqual(s.requests.length, 1);
      assert.strictEqual(s.requests[0].params.cwd, A);
      assert.deepStrictEqual(s.requests[0].params.additionalDirectories, [B, C]);
      const [session] = Object.values(s.registry.get(backendHarnessSnapshotAtom(CODEX)).sessions);
      assert.strictEqual(session.cwd, A);
      assert.strictEqual(session.workspaceFile, W);
      assert.isFalse(JSON.stringify(s.requests).includes('code-workspace'));
    }).pipe(Effect.scoped),
  );

  it.effect('picking a directory Project afterwards clears the folders and the file', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* ensureVirtual(s.registry, { project: W });
      yield* selectVirtualProject(s.registry, D);
      assert.deepStrictEqual(
        [s.registry.get(virtualSessionAtom)?.cwd, s.registry.get(virtualSessionAtom)?.workspaceFile],
        [D, undefined],
      );
      yield* s.bind;
      assert.strictEqual(s.requests.at(-1)?.params.cwd, D);
      assert.isFalse('additionalDirectories' in (s.requests.at(-1)?.params ?? {}));
    }).pipe(Effect.scoped),
  );

  it.effect('picking a Workspace project for an existing draft re-binds with its folders', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      yield* ensureVirtual(s.registry, { project: D });
      yield* s.bind;
      yield* selectVirtualProject(s.registry, W);
      yield* Effect.yieldNow;
      yield* bindVirtualOnUsable(s.registry, CODEX);
      assert.strictEqual(s.requests.at(-1)?.params.cwd, A);
      assert.deepStrictEqual(s.requests.at(-1)?.params.additionalDirectories, [B, C]);
    }).pipe(Effect.scoped),
  );

  it.effect('an unresolved Workspace project never reaches the Agent', () =>
    Effect.gen(function* () {
      const s = yield* setup();
      const bad = resolve('/ws/gone.code-workspace');
      s.registry.set(workspaceFilesAtom, {
        [bad]: { _tag: 'Failed', message: 'The workspace file could not be read' },
      });
      const error = yield* Effect.flip(ensureVirtual(s.registry, { project: bad }));
      assert.strictEqual(error._tag, 'ProjectUnresolved');
      const unread = yield* Effect.flip(selectVirtualProject(s.registry, resolve('/ws/unread.code-workspace')));
      assert.strictEqual(unread._tag, 'ProjectUnresolved');
      assert.deepStrictEqual(s.requests, []);
      assert.isNull(s.registry.get(virtualSessionAtom));
    }).pipe(Effect.scoped),
  );
});

describe('activating a session created in a Workspace project', () => {
  const activate = Effect.fnUntraced(function* (options: {
    readonly file?: string;
    readonly stored: readonly string[];
  }) {
    const s = yield* setup();
    const atoms = createSessionLifecycleAtoms(createHostRuntime(s.layer), () => Effect.void);
    if (options.file !== undefined) s.store.set(W, { kind: 'file', content: options.file });
    updateHarnessSnapshot(s.registry, CODEX, current => ({
      ...current,
      sessionHistory: [{ additionalDirectories: options.stored, cwd: A, sessionId: 's1', workspaceFile: W }],
      sessions: { s1: { ...initialSessionSnapshot('s1', 'inactive'), cwd: A } },
    }));
    advertise(s.registry, CODEX, { agentCapabilities: { sessionCapabilities: { additionalDirectories: {} } } });
    yield* runAtomFn(s.registry, atoms.activateSessionAtomFn, { launchTarget: CODEX, sessionId: 's1' });
    return s.requests[0];
  });

  it.effect("sends the file's current folders minus the stored cwd, keeping the stored cwd", () =>
    Effect.gen(function* () {
      const request = yield* activate({
        file: JSON.stringify({ folders: [{ path: A }, { path: C }, { path: resolve('/ws/new') }] }),
        stored: [B, C],
      });
      assert.strictEqual(request.params.cwd, A);
      assert.deepStrictEqual(request.params.additionalDirectories, [C, resolve('/ws/new')]);
    }).pipe(Effect.scoped),
  );

  it.effect('a first folder that moved still activates with the stored cwd', () =>
    Effect.gen(function* () {
      const request = yield* activate({
        file: JSON.stringify({ folders: [{ path: resolve('/ws/moved') }, { path: A }, { path: B }] }),
        stored: [B],
      });
      assert.strictEqual(request.params.cwd, A);
      assert.deepStrictEqual(request.params.additionalDirectories, [resolve('/ws/moved'), B]);
    }).pipe(Effect.scoped),
  );

  it.effect('falls back to the stored list when the file is missing or unusable', () =>
    Effect.gen(function* () {
      const missing = yield* activate({ stored: [B, C] });
      assert.deepStrictEqual(missing.params.additionalDirectories, [B, C]);
      const unusable = yield* activate({ file: '{"folders":[]}', stored: [B] });
      assert.deepStrictEqual(unusable.params.additionalDirectories, [B]);
    }).pipe(Effect.scoped),
  );
});
