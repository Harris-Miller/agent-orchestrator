import { EditorFiles, EditorFilesFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

const unsupported = () => Effect.fail(new EditorFilesFailed({ message: 'EditorFiles unsupported' }));

export const EditorFilesLive = Layer.succeed(EditorFiles, {
  readText: unsupported,
  supported: false,
  writeText: unsupported,
});
