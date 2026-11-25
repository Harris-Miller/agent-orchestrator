/** Workspace folders feed the Virtual blob's Additional directories and workspace file; Projects stay the Workspace cwd only. */
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

const WORKSPACE_FILE = '/w/app.code-workspace';

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
      yield* boot(registry, { paths: ['/w', '/a'], workspaceFile: WORKSPACE_FILE });
      yield* bindVirtualOnUsable(registry, CODEX);
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessions: { ...current.sessions, active: { ...initialSessionSnapshot('active', 'active'), cwd: '/w' } },
      }));
      calls.length = 0;

      yield* handleWorkspaceFoldersChanged(registry, { paths: ['/w', '/a', '/b'], workspaceFile: WORKSPACE_FILE }).pipe(
        Effect.provide(mockHostLayer),
      );
      yield* bindVirtualOnUsable(registry, CODEX);
      yield* Effect.yieldNow;

      assert.sameMembers(calls, ['close:bound-1', 'delete:bound-1', 'new']);
      assert.deepStrictEqual(
        requests.map(request => request.params.additionalDirectories),
        [['/a'], ['/a', '/b']],
      );
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-2');
      assert.deepStrictEqual(sessionsOf(registry)['bound-2'].additionalDirectories, ['/a', '/b']);
      assert.strictEqual(sessionsOf(registry).active.status, 'active');
    }).pipe(Effect.scoped),
  );

  it.effect('updates an unbound blob without a Bind, and a workspace file change alone never rebinds', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* installFakeAgent(calls, { additionalDirectories: true });
      const registry = yield* freshRegistry;
      yield* boot(registry, { paths: ['/w', '/a'] });

      yield* handleWorkspaceFoldersChanged(registry, { paths: ['/w'] }).pipe(Effect.provide(mockHostLayer));
      assert.isEmpty(registry.get(virtualSessionAtom)?.additionalDirectories ?? []);
      assert.deepStrictEqual(calls, []);

      yield* bindVirtualOnUsable(registry, CODEX);
      calls.length = 0;
      yield* handleWorkspaceFoldersChanged(registry, { paths: ['/w'], workspaceFile: WORKSPACE_FILE }).pipe(
        Effect.provide(mockHostLayer),
      );
      yield* Effect.yieldNow;

      assert.deepStrictEqual(calls, []);
      assert.strictEqual(registry.get(virtualSessionAtom)?.workspaceFile, WORKSPACE_FILE);
      assert.strictEqual(registry.get(virtualSessionAtom)?.sessionId, 'bound-1');
    }).pipe(Effect.scoped),
  );
});

describe('a changed first folder', () => {
  it.effect('seeds the re-pointed blob with the new folder set', () =>
    Effect.gen(function* () {
      yield* installFakeAgent([], { additionalDirectories: true });
      const registry = yield* freshRegistry;
      yield* boot(registry, { paths: ['/w', '/a'], workspaceFile: WORKSPACE_FILE });

      yield* handleWorkspaceFoldersChanged(registry, { paths: ['/n', '/m'] }).pipe(Effect.provide(mockHostLayer));
      yield* bindVirtualOnUsable(registry, CODEX);

      const blob = registry.get(virtualSessionAtom);
      assert.strictEqual(blob?.cwd, '/n');
      assert.deepStrictEqual(blob?.additionalDirectories, ['/m']);
      assert.isUndefined(blob?.workspaceFile);
    }).pipe(Effect.scoped),
  );
});

describe('ensureVirtual without a Workspace', () => {
  it.effect('a desktop-style cwd or no cwd never stamps directories over a blob', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      yield* ensureVirtual(registry, { cwd: '/proj' });
      assert.isUndefined(registry.get(virtualSessionAtom)?.additionalDirectories);

      yield* editVirtual(registry, { additionalDirectories: ['/lib/a'], workspaceFile: '/proj/x.code-workspace' });
      yield* ensureVirtual(registry, {});
      yield* ensureVirtual(registry, { cwd: '/proj', patchCwdIfSelectedVirtual: true });

      assert.deepStrictEqual(registry.get(virtualSessionAtom)?.additionalDirectories, ['/lib/a']);
      assert.strictEqual(registry.get(virtualSessionAtom)?.workspaceFile, '/proj/x.code-workspace');
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
        paths: ['/w', '/a', '/b'],
        workspaceFile: WORKSPACE_FILE,
      });

      assert.deepStrictEqual(requests[0].params.additionalDirectories, ['/a', '/b']);
      assert.deepStrictEqual(record.additionalDirectories, ['/a', '/b']);
      assert.strictEqual(record.workspaceFile, WORKSPACE_FILE);
      assert.deepStrictEqual(projects.projects, ['/w']);
      const text = JSON.stringify(projectsFile);
      assert.isFalse(text.includes('/a') || text.includes('code-workspace'));
    }).pipe(Effect.scoped),
  );

  it.effect('a saved single-folder workspace records the workspace file and no directories', () =>
    Effect.gen(function* () {
      const { record, requests } = yield* run({ paths: ['/w'], workspaceFile: WORKSPACE_FILE });

      assert.isFalse('additionalDirectories' in requests[0].params);
      assert.isFalse('additionalDirectories' in record);
      assert.strictEqual(record.workspaceFile, WORKSPACE_FILE);
    }).pipe(Effect.scoped),
  );

  it.effect('an untitled workspace records no workspace file', () =>
    Effect.gen(function* () {
      const { record } = yield* run({ paths: ['/w', '/a'] });

      assert.deepStrictEqual(record.additionalDirectories, ['/a']);
      assert.isFalse('workspaceFile' in record);
    }).pipe(Effect.scoped),
  );
});
