/** Workspace folders feed the Virtual blob's Additional directories and workspace file; Projects stay the Workspace cwd only. */
import { join, resolve } from 'node:path';

import { assert, describe, it } from '@effect/vitest';
import { projectsPath, readProjects, readTrackedSessions, trackedSessionRows } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import { initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import type { SessionRequest } from './fakeAgent.testing.ts';
import { CODEX, freshRegistry, installFakeAgent, setPhase } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { mockHostLayer } from './mockHostLayer.testing.ts';
import { settleTrackedSessionWrites, startTrackedSessionsPersistence } from './trackedSessions.ts';
import {
  bindVirtualOnUsable,
  editVirtual,
  ensureVirtual,
  sendVirtual,
  setVirtualLaunchTarget,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';
import { bootWorkspaceFolders, handleWorkspaceFoldersChanged } from './workspaceFolders.ts';
import { workspaceDirectoriesAtom } from './workspaceFolderPaths.atoms.ts';

const W = resolve('/w');
const A = resolve('/a');
const B = resolve('/b');
const N = resolve('/n');
const M = resolve('/m');
const PROJ = resolve('/proj');
const LIB_A = resolve('/lib/a');
const WORKSPACE_FILE = join(W, 'app.code-workspace');
const PROJ_FILE = join(PROJ, 'x.code-workspace');

type Registry = AtomRegistry.AtomRegistry;

const sessionsOf = (registry: Registry) => registry.get(backendHarnessSnapshotAtom(CODEX)).sessions;

/** Boot the folders, pick Codex and bring the provider up so the blob can Bind. */
const boot = Effect.fnUntraced(function* (registry: Registry, folders: Parameters<typeof bootWorkspaceFolders>[1]) {
  setPhase(registry, CODEX, 'connecting');
  yield* bootWorkspaceFolders(registry, folders).pipe(Effect.provide(mockHostLayer));
  yield* setVirtualLaunchTarget(registry, CODEX);
  setPhase(registry, CODEX, 'ready');
});

describe('a set change with the same first folder', () => {
  it.effect('rebinds the Bound Virtual with the new list and leaves Active sessions up', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const requests: SessionRequest[] = [];
      yield* installFakeAgent(calls, { additionalDirectories: true, requests });
      const registry = yield* freshRegistry;
      yield* boot(registry, { paths: [W, A], workspaceFile: WORKSPACE_FILE });
      yield* bindVirtualOnUsable(registry, CODEX);
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessions: { ...current.sessions, active: { ...initialSessionSnapshot('active', 'active'), cwd: W } },
      }));
      calls.length = 0;

      yield* handleWorkspaceFoldersChanged(registry, { paths: [W, A, B], workspaceFile: WORKSPACE_FILE }).pipe(
        Effect.provide(mockHostLayer),
      );
      yield* bindVirtualOnUsable(registry, CODEX);
      yield* Effect.yieldNow;

      assert.sameMembers(calls, ['close:bound-1', 'delete:bound-1', 'new']);
      assert.deepStrictEqual(
        requests.map(request => request.params.additionalDirectories),
        [[A], [A, B]],
      );
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-2');
      assert.deepStrictEqual(sessionsOf(registry)['bound-2'].additionalDirectories, [A, B]);
      assert.strictEqual(sessionsOf(registry).active.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('updates an unbound blob without a Bind, and a workspace file change alone never rebinds', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls, { additionalDirectories: true });
      const registry = yield* freshRegistry;
      yield* boot(registry, { paths: [W, A] });

      yield* handleWorkspaceFoldersChanged(registry, { paths: [W] }).pipe(Effect.provide(mockHostLayer));
      const unbound = registry.get(virtualSessionAtom);
      assert.isOk(unbound);
      assert.isEmpty(unbound?.additionalDirectories ?? []);
      assert.deepStrictEqual(calls, []);

      yield* bindVirtualOnUsable(registry, CODEX);
      calls.length = 0;
      yield* handleWorkspaceFoldersChanged(registry, { paths: [W], workspaceFile: WORKSPACE_FILE }).pipe(
        Effect.provide(mockHostLayer),
      );
      yield* Effect.yieldNow;

      assert.deepStrictEqual(calls, []);
      const bound = registry.get(virtualSessionAtom);
      assert.isOk(bound);
      assert.strictEqual(bound?.workspaceFile, WORKSPACE_FILE);
      assert.strictEqual(bound?.sessionId, 'bound-1');
    }).pipe(Effect.scoped),
  );

  it.effect('a workspace file change on a Bound blob updates the Bound session in place and reaches Materialize', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
      yield* installFakeAgent([], { additionalDirectories: true });
      const registry = yield* freshRegistry;
      yield* startTrackedSessionsPersistence(registry, CODEX).pipe(Effect.provide(layer));
      yield* boot(registry, { paths: [W] });
      yield* bindVirtualOnUsable(registry, CODEX);
      const sessionId = registry.get(virtualSessionAtom)?.sessionId;
      assert.isDefined(sessionId);

      yield* handleWorkspaceFoldersChanged(registry, { paths: [W], workspaceFile: WORKSPACE_FILE }).pipe(
        Effect.provide(mockHostLayer),
      );
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, sessionId);
      assert.strictEqual(registry.get(virtualSessionAtom)?.workspaceFile, WORKSPACE_FILE);
      assert.strictEqual(sessionsOf(registry)[sessionId ?? ''].workspaceFile, WORKSPACE_FILE);

      yield* handleWorkspaceFoldersChanged(registry, { paths: [W] }).pipe(Effect.provide(mockHostLayer));
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, sessionId);
      assert.isUndefined(registry.get(virtualSessionAtom)?.workspaceFile);
      assert.isFalse('workspaceFile' in sessionsOf(registry)[sessionId ?? '']);

      yield* handleWorkspaceFoldersChanged(registry, { paths: [W], workspaceFile: WORKSPACE_FILE }).pipe(
        Effect.provide(mockHostLayer),
      );
      yield* editVirtual(registry, { draft: 'hello' });
      yield* sendVirtual(registry, () => Effect.void).pipe(Effect.provide(layer));
      yield* Effect.promise(settleTrackedSessionWrites);
      const [record] = trackedSessionRows(
        yield* readTrackedSessions(toLaunchTarget(CODEX)).pipe(Effect.provide(layer)),
      );
      assert.strictEqual(record.workspaceFile, WORKSPACE_FILE);
    }).pipe(Effect.scoped),
  );
});

describe('a changed first folder', () => {
  it.effect('seeds the re-pointed blob with the new folder set', () =>
    Effect.gen(function* () {
      yield* installFakeAgent([], { additionalDirectories: true });
      const registry = yield* freshRegistry;
      yield* boot(registry, { paths: [W, A], workspaceFile: WORKSPACE_FILE });

      yield* handleWorkspaceFoldersChanged(registry, { paths: [N, M] }).pipe(Effect.provide(mockHostLayer));
      yield* bindVirtualOnUsable(registry, CODEX);

      const blob = registry.get(virtualSessionAtom);
      assert.isOk(blob);
      assert.strictEqual(blob?.cwd, N);
      assert.deepStrictEqual(blob?.additionalDirectories, [M]);
      assert.isUndefined(blob?.workspaceFile);
    }).pipe(Effect.scoped),
  );
});

describe('ensureVirtual without a Workspace', () => {
  it.effect('a desktop-style cwd or no cwd never stamps directories over a blob', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      yield* ensureVirtual(registry, { cwd: PROJ });
      const first = registry.get(virtualSessionAtom);
      assert.isOk(first);
      assert.isUndefined(first?.additionalDirectories);

      yield* editVirtual(registry, { additionalDirectories: [LIB_A], workspaceFile: PROJ_FILE });
      yield* ensureVirtual(registry, {});
      yield* ensureVirtual(registry, { cwd: PROJ, patchCwdIfSelectedVirtual: true });

      const after = registry.get(virtualSessionAtom);
      assert.isOk(after);
      assert.deepStrictEqual(after?.additionalDirectories, [LIB_A]);
      assert.strictEqual(after?.workspaceFile, PROJ_FILE);
      assert.deepStrictEqual(registry.get(workspaceDirectoriesAtom), {});
    }).pipe(Effect.scoped),
  );
});

describe('Materialize in a workspace', () => {
  const run = Effect.fnUntraced(function* (folders: Parameters<typeof bootWorkspaceFolders>[1]) {
    const store = new Map<string, MapFsEntry>();
    const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
    const calls: string[] = [];
    const requests: SessionRequest[] = [];
    yield* installFakeAgent(calls, { additionalDirectories: true, requests });
    const registry = yield* freshRegistry;
    yield* startTrackedSessionsPersistence(registry, CODEX).pipe(Effect.provide(layer));
    yield* boot(registry, folders);
    yield* editVirtual(registry, { draft: 'hello' });
    yield* bindVirtualOnUsable(registry, CODEX);
    yield* sendVirtual(registry, () => Effect.void).pipe(Effect.provide(layer));
    yield* Effect.promise(settleTrackedSessionWrites);
    const [record] = trackedSessionRows(yield* readTrackedSessions(toLaunchTarget(CODEX)).pipe(Effect.provide(layer)));
    const projects = yield* readProjects().pipe(Effect.provide(layer));
    const projectsFile = store.get(yield* projectsPath().pipe(Effect.provide(layer)));
    return { projects, projectsFile, record, requests };
  });

  it.effect('a saved multi-root workspace records its Additional directories and workspace file', () =>
    Effect.gen(function* () {
      const { projects, projectsFile, record, requests } = yield* run({
        paths: [W, A, B],
        workspaceFile: WORKSPACE_FILE,
      });

      assert.deepStrictEqual(requests[0].params.additionalDirectories, [A, B]);
      assert.deepStrictEqual(record.additionalDirectories, [A, B]);
      assert.strictEqual(record.workspaceFile, WORKSPACE_FILE);
      assert.deepStrictEqual(projects.projects, [W]);
      const text = JSON.stringify(projectsFile);
      assert.notInclude(text, A);
      assert.notInclude(text, B);
      assert.notInclude(text, WORKSPACE_FILE);
    }).pipe(Effect.scoped),
  );

  it.effect('a saved single-folder workspace records the workspace file and no directories', () =>
    Effect.gen(function* () {
      const { record, requests } = yield* run({ paths: [W], workspaceFile: WORKSPACE_FILE });

      assert.isFalse('additionalDirectories' in requests[0].params);
      assert.isFalse('additionalDirectories' in record);
      assert.strictEqual(record.workspaceFile, WORKSPACE_FILE);
    }).pipe(Effect.scoped),
  );

  it.effect('an untitled workspace records no workspace file', () =>
    Effect.gen(function* () {
      const { record } = yield* run({ paths: [W, A] });

      assert.deepStrictEqual(record.additionalDirectories, [A]);
      assert.isFalse('workspaceFile' in record);
    }).pipe(Effect.scoped),
  );
});
