import { assert, describe, it } from '@effect/vitest';
import { BundledResource, Clipboard, FileDialog, OpenUrl, OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { FetchHttpClient } from 'effect/http';
import { layer as posixPathLayer } from 'effect/Path';
import { ChildProcessSpawner } from 'effect/process';
import { AtomRegistry } from 'effect/reactivity';

import { createHostRuntime } from '../createHostRuntime.ts';
import { emptySessionTranscript } from '../host/sessionUpdateReducer.ts';
import { bindHostRuntime } from '../hostRuntime.ts';

const mockHostLayer = Layer.mergeAll(
  Layer.succeed(BundledResource, { resolve: resourcePath => Effect.succeed(`/resources/${resourcePath}`) }),
  Layer.succeed(Clipboard, { readText: () => Effect.succeed(''), writeText: () => Effect.void }),
  Layer.succeed(FileDialog, { pickFiles: () => Effect.succeed([]) }),
  Layer.succeed(OpenUrl, { open: () => Effect.void }),
  Layer.succeed(OS, {
    arch: () => 'arm64',
    cwd: () => '/home/operator',
    env: () => ({}),
    homedir: () => '/home/operator',
    platform: () => 'linux',
  }),
  layerNoop({}),
  posixPathLayer,
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die('unused')),
  ),
  FetchHttpClient.layer,
);

bindHostRuntime(createHostRuntime(mockHostLayer));

const [
  { backendHarnessStateAtom, selectedAtom },
  { sessionListScopeAtom },
  { workspaceFolderPathsAtom },
  workspaceFolders,
] = await Promise.all([
  import('./backendState.atoms.ts'),
  import('./sessionListScope.atoms.ts'),
  import('./workspaceFolderPaths.atoms.ts'),
  import('./workspaceFolders.ts'),
]);

const { bootWorkspaceFolders, workspaceFoldersChanged } = workspaceFolders;

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
      registry.set(backendHarnessStateAtom('codex-acp'), {
        ...registry.get(backendHarnessStateAtom('codex-acp')),
        phase: 'ready',
        sessions: {
          session: {
            cwd: '/workspace',
            sessionId: 'session',
            status: 'active',
            transcript: emptySessionTranscript(),
          },
        },
      });

      yield* workspaceFoldersChanged(registry, ['/workspace', '/new']);

      assert.deepStrictEqual(registry.get(workspaceFolderPathsAtom), ['/workspace', '/new']);
      assert.strictEqual(registry.get(backendHarnessStateAtom('codex-acp')).sessions.session.status, 'active');
      registry.dispose();
    }),
  );

  it.effect('clearing first folder clears Virtual and Selected without a ready backend', () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      registry.set(workspaceFolderPathsAtom, ['/workspace']);
      registry.set(selectedAtom, { _tag: 'Virtual' });

      yield* workspaceFoldersChanged(registry, []);

      assert.deepStrictEqual(registry.get(workspaceFolderPathsAtom), []);
      assert.isUndefined(registry.get(selectedAtom));
      registry.dispose();
    }),
  );
});
