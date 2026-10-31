import { AtomicFile } from '@lib/context-services';
import { invoke } from '@tauri-apps/api/core';
import { Effect, Layer } from 'effect';
import * as PlatformError from 'effect/PlatformError';

/** Tauri Live for {@link AtomicFile}: the constrained `atomic_replace_provider_state` Rust command. */
export const AtomicFileLive = Layer.succeed(AtomicFile, {
  replaceFileString: (path: string, content: string) =>
    Effect.tryPromise({
      catch: cause =>
        PlatformError.systemError({
          _tag: 'Unknown',
          cause,
          description: cause instanceof Error ? cause.message : String(cause),
          method: 'replaceFileString',
          module: 'FileSystem',
          pathOrDescriptor: path,
        }),
      try: () => invoke<unknown>('atomic_replace_provider_state', { content, path }),
    }),
});
