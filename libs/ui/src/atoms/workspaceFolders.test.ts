import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { emptySessionTranscript } from '../host/sessionUpdateReducer.ts';
import { bindHostRuntime } from '../hostRuntime.ts';

import { mockHostLayer } from './mockHostLayer.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';

bindHostRuntime(createHostRuntime(mockHostLayer));

const [
  { backendHarnessSnapshotAtom, selectedAtom },
  { sessionListScopeAtom },
  { workspaceFolderPathsAtom },
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
      yield* bootWorkspaceFolders(registry, []);

      assert.deepStrictEqual(registry.get(workspaceFolderPathsAtom), []);
      assert.deepStrictEqual(registry.get(sessionListScopeAtom), { _tag: 'Skip' });
      registry.dispose();
    }),
  );

  it.effect('same first folder updates paths without tearing down sessions', () =>
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

      yield* handleWorkspaceFoldersChanged(registry, ['/workspace', '/new']);

      assert.deepStrictEqual(registry.get(workspaceFolderPathsAtom), ['/workspace', '/new']);
      assert.strictEqual(registry.get(backendHarnessSnapshotAtom('codex-acp')).sessions.session.status, 'active');
      registry.dispose();
    }),
  );

  it.effect('clearing first folder clears Virtual and Selected without a ready backend', () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      registry.set(workspaceFolderPathsAtom, ['/workspace']);
      registry.set(selectedAtom, { _tag: 'Virtual' });

      yield* handleWorkspaceFoldersChanged(registry, []);

      assert.deepStrictEqual(registry.get(workspaceFolderPathsAtom), []);
      assert.isUndefined(registry.get(selectedAtom));
      registry.dispose();
    }),
  );
});
