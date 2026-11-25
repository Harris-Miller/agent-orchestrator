import { join, resolve } from 'node:path';

import { assert, describe, it } from '@effect/vitest';
import { upsertTrackedSessions } from '@lib/hoa-home';
import { mapFsTestServices } from '@lib/hoa-home/testing';
import type { MapFsEntry } from '@lib/hoa-home/testing';
import { Effect, Layer } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import { emptySessionTranscript } from '../host/sessionUpdateReducer.ts';
import { bindHostRuntime } from '../hostRuntime.ts';

import { mockHostLayer } from './mockHostLayer.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { sessionHistorySearchAtom } from './sessionHistorySearch.atoms.ts';

const WORKSPACE_FILE = join(resolve('/workspace'), 'x.code-workspace');
const NEW_DIR = resolve('/new');

bindHostRuntime(createHostRuntime(mockHostLayer));

const [
  { backendHarnessSnapshotAtom, selectedAtom },
  { sessionListScopeAtom },
  { workspaceDirectoriesAtom, workspaceFolderPathsAtom },
  workspaceFolders,
] = await Promise.all([
  import('./backendState.atoms.ts'),
  import('./sessionListScope.atoms.ts'),
  import('./workspaceFolderPaths.atoms.ts'),
  import('./workspaceFolders.ts'),
]);

const { bootWorkspaceFolders, handleWorkspaceFoldersChanged } = workspaceFolders;

describe('workspace folder policy', () => {
  it.effect('boot stores folder paths and derived list scope', () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      yield* bootWorkspaceFolders(registry, { paths: [] });

      assert.deepStrictEqual(registry.get(workspaceFolderPathsAtom), []);
      assert.deepStrictEqual(registry.get(sessionListScopeAtom), { _tag: 'Skip' });
      registry.dispose();
    }),
  );

  it.effect('same first folder updates the folder set and directories without tearing down sessions', () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      registry.set(workspaceFolderPathsAtom, ['/workspace', '/old']);
      updateHarnessSnapshot(registry, 'codex-acp', () => ({
        ...registry.get(backendHarnessSnapshotAtom('codex-acp')),
        phase: 'ready',
        sessions: {
          session: {
            cwd: '/workspace',
            sessionId: 'session',
            status: 'active',
            transcript: emptySessionTranscript(),
          },
        },
      }));

      yield* handleWorkspaceFoldersChanged(registry, {
        paths: [resolve('/workspace'), NEW_DIR],
        workspaceFile: WORKSPACE_FILE,
      }).pipe(Effect.provide(mockHostLayer));

      assert.deepStrictEqual(registry.get(workspaceFolderPathsAtom), [resolve('/workspace'), NEW_DIR]);
      assert.deepStrictEqual(registry.get(workspaceDirectoriesAtom), {
        additionalDirectories: [NEW_DIR],
        workspaceFile: WORKSPACE_FILE,
      });
      assert.strictEqual(registry.get(backendHarnessSnapshotAtom('codex-acp')).sessions.session.status, 'active');
      registry.dispose();
    }),
  );

  it.effect('clears search when the first workspace changes, including while history is hidden', () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      registry.set(workspaceFolderPathsAtom, ['/workspace']);
      registry.set(sessionHistorySearchAtom, { scope: '/workspace', query: 'old search' });
      yield* handleWorkspaceFoldersChanged(registry, { paths: ['/new'] }).pipe(Effect.provide(mockHostLayer));
      assert.deepStrictEqual(registry.get(sessionHistorySearchAtom), { scope: '/new', query: '' });
      registry.dispose();
    }),
  );

  it.effect('a changed first folder with a ready backend hydrates the new Workspace cwd from the tracked store', () =>
    Effect.gen(function* () {
      const store = new Map<string, MapFsEntry>();
      const layer = Layer.mergeAll(mockHostLayer, mapFsTestServices(store));
      const registry = AtomRegistry.make();
      registry.set(workspaceFolderPathsAtom, ['/old']);
      updateHarnessSnapshot(registry, 'codex-acp', current => ({ ...current, phase: 'ready' }));
      yield* upsertTrackedSessions(toLaunchTarget('codex-acp'), [
        { cwd: '/new', sessionId: 'tracked' },
        { cwd: '/elsewhere', sessionId: 'other' },
      ]).pipe(Effect.provide(layer));

      yield* handleWorkspaceFoldersChanged(registry, { paths: ['/new'] }).pipe(Effect.provide(layer));

      assert.deepStrictEqual(
        registry.get(backendHarnessSnapshotAtom('codex-acp')).sessionHistory.map(entry => entry.sessionId),
        ['tracked'],
      );
      registry.dispose();
    }),
  );

  it.effect('clearing first folder clears Virtual and Selected without a ready backend', () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      registry.set(workspaceFolderPathsAtom, ['/workspace']);
      registry.set(selectedAtom, { _tag: 'Virtual' });

      yield* handleWorkspaceFoldersChanged(registry, { paths: [] }).pipe(Effect.provide(mockHostLayer));

      assert.deepStrictEqual(registry.get(workspaceFolderPathsAtom), []);
      assert.isUndefined(registry.get(selectedAtom));
      registry.dispose();
    }),
  );
});
