import { BundledResource, BundledResourceMissing } from '@lib/context-services';
import { resolveResource } from '@tauri-apps/api/path';
import { Effect, Layer } from 'effect';

/** Tauri Live for {@link BundledResource}: wraps `resolveResource`. */
export const BundledResourceLive = Layer.succeed(BundledResource, {
  resolve: Effect.fn('BundledResource.resolve')(function* (resourcePath: string) {
    return yield* Effect.tryPromise({
      catch: cause =>
        new BundledResourceMissing({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
          resourcePath,
        }),
      try: () => resolveResource(resourcePath),
    });
  }),
});
