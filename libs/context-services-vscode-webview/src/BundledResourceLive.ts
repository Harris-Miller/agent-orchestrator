import { BundledResource, BundledResourceMissing } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

export const makeBundledResourceLive = (client: IpcClient): Layer.Layer<BundledResource> =>
  Layer.succeed(BundledResource, {
    resolve: (resourcePath: string) =>
      client
        .request(id => ({ _tag: 'BundledResolve' as const, id, resourcePath }))
        .pipe(
          Effect.mapError(
            error =>
              new BundledResourceMissing({
                message: error.message,
                resourcePath,
              }),
          ),
          Effect.flatMap(response => {
            if (response._tag === 'BundledResolveResult') {
              return Effect.succeed(response.path);
            }
            return Effect.fail(
              new BundledResourceMissing({
                message: `Unexpected BundledResolve response: ${response._tag}`,
                resourcePath,
              }),
            );
          }),
        ),
  });
