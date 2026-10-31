import { AtomicFile, atomicReplaceFailed } from '@lib/context-services';
import { invoke } from '@tauri-apps/api/core';
import { Effect, Layer } from 'effect';

/** Tauri Live for {@link AtomicFile}: the constrained `atomic_replace_provider_state` Rust command. */
export const AtomicFileLive = Layer.succeed(AtomicFile, {
  replaceFileString: (path: string, content: string) =>
    Effect.tryPromise({
      catch: cause => atomicReplaceFailed(path, cause),
      try: () => invoke<unknown>('atomic_replace_provider_state', { content, path }),
    }),
});
