import { BundledResource, BundledResourceMissing } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

export const makeBundledResourceLive = (client: IpcClient): Layer.Layer<BundledResource> =>
  Layer.succeed(BundledResource, {
    resolve: Effect.fn('BundledResource.resolve')(function* (resourcePath: string) {
      const response = yield* client.request({ _tag: 'BundledResolve', resourcePath }).pipe(
        Effect.mapError(
          error =>
            new BundledResourceMissing({
              message: error.message,
              resourcePath,
            }),
        ),
      );
      return response.path;
    }),
  });
