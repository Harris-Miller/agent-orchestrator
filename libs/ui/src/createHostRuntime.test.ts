import { assert, describe, it } from '@effect/vitest';
import { BundledResource, Clipboard, OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import { ChildProcessSpawner } from 'effect/unstable/process';
import { AsyncResult, AtomRegistry } from 'effect/unstable/reactivity';

import { createHostRuntime } from './createHostRuntime.ts';

const mockOsLayer = Layer.succeed(OS, {
  cwd: () => '/home/operator',
  env: () => ({}),
  homedir: () => '/home/operator',
  platform: () => 'linux',
});

const mockBundledResourceLayer = Layer.succeed(BundledResource, {
  resolve: (resourcePath: string) => Effect.succeed(`/resources/${resourcePath}`),
});

const mockClipboardLayer = Layer.succeed(Clipboard, {
  readText: () => Effect.succeed(''),
  writeText: () => Effect.void,
});

const mockSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die(new Error('ChildProcessSpawner not used in createHostRuntime smoke test'))),
);

const mockHostLayer = Layer.mergeAll(
  mockBundledResourceLayer,
  mockClipboardLayer,
  mockOsLayer,
  layerNoop({}),
  posixPathLayer,
  mockSpawnerLayer,
);

describe('createHostRuntime', () => {
  it.effect('provides Host services to atomRuntime.fn without Tauri', () =>
    Effect.gen(function* () {
      const { atomRuntime } = createHostRuntime(mockHostLayer);

      const viaLayer = yield* OS.pipe(Effect.provide(mockHostLayer));
      assert.strictEqual(viaLayer.homedir(), '/home/operator');

      const readHomedirAtom = atomRuntime.fn(() =>
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
      const { hostRuntime } = createHostRuntime(mockHostLayer);
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
