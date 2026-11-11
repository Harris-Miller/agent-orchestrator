import { OpenFile, OpenFileFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

const unsupported = () => Effect.fail(new OpenFileFailed({ message: 'OpenFile unsupported on desktop' }));

export const OpenFileLive = Layer.succeed(OpenFile, {
  openImageData: unsupported,
  supported: false,
  open: unsupported,
});
