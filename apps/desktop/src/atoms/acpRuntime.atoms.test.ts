import { assert, describe, it } from '@effect/vitest';
import { OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import { ChildProcessSpawner } from 'effect/unstable/process';
import { AsyncResult, AtomRegistry } from 'effect/unstable/reactivity';

import { createAcpRuntime } from './acpRuntime.atoms.ts';

const mockOsLayer = Layer.succeed(OS, {
  cwd: () => '/home/operator',
  env: () => ({}),
  homedir: () => '/home/operator',
  platform: () => 'linux',
});

const mockSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die(new Error('ChildProcessSpawner not used in acpRuntime smoke test'))),
);

const mockHostLayer = Layer.mergeAll(mockOsLayer, layerNoop({}), posixPathLayer, mockSpawnerLayer);

describe('createAcpRuntime', () => {
  it.effect('provides Host services to acpRuntime.fn without Tauri', () =>
    Effect.gen(function* () {
      const { acpRuntime } = createAcpRuntime(mockHostLayer);

      const viaLayer = yield* OS.pipe(Effect.provide(mockHostLayer));
      assert.strictEqual(viaLayer.homedir(), '/home/operator');

      const readHomedirAtom = acpRuntime.fn(() =>
        Effect.gen(function* () {
          const os = yield* OS;
          return os.homedir();
        }),
      );

      const registry = AtomRegistry.make();
      registry.mount(readHomedirAtom);

      const home = yield* Effect.callback<string>(resume => {
        const unsub = registry.subscribe(
          readHomedirAtom,
          result => {
            if (AsyncResult.isSuccess(result)) {
              unsub();
              resume(Effect.succeed(AsyncResult.getOrThrow(result)));
            } else if (AsyncResult.isFailure(result)) {
              unsub();
              resume(Effect.failCause(result.cause));
            }
          },
          { immediate: true },
        );
        registry.set(readHomedirAtom, undefined);
      });

      assert.strictEqual(home, '/home/operator');
      registry.dispose();
    }),
  );

  it.effect('provides Host services via hostRuntime.runPromise without Tauri', () =>
    Effect.gen(function* () {
      const { hostRuntime } = createAcpRuntime(mockHostLayer);
      const home = yield* Effect.promise(() =>
        hostRuntime.runPromise(
          Effect.gen(function* () {
            const os = yield* OS;
            return os.homedir();
          }),
        ),
      );
      assert.strictEqual(home, '/home/operator');
      yield* Effect.promise(() => hostRuntime.dispose());
    }),
  );
});
