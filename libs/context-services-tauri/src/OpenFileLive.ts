import { OpenFile, OpenFileFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

export const OpenFileLive = Layer.succeed(OpenFile, {
  openImageData: () => Effect.fail(new OpenFileFailed({ message: 'OpenFile unsupported on desktop (#169)' })),
  supported: false,
  open: (path: string) =>
    Effect.fail(new OpenFileFailed({ message: `OpenFile unsupported on desktop (#169): ${path}` })),
});
