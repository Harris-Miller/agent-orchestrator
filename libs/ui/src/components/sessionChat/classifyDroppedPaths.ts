import { Effect } from 'effect';
import { FileSystem } from 'effect/FileSystem';

import type { DroppedPathEntry } from './composerDrop.ts';

/** Stat each dropped path to tell files from folders. Stat failures (e.g. outside the fs scope) fall back to `file`. */
export const classifyDroppedPaths = Effect.fnUntraced(function* (paths: readonly string[]) {
  const fs = yield* FileSystem;
  return yield* Effect.all(
    paths.map(path =>
      fs.stat(path).pipe(
        Effect.map((info): DroppedPathEntry => ({ kind: info.type === 'Directory' ? 'dir' : 'file', path })),
        Effect.orElseSucceed((): DroppedPathEntry => ({ kind: 'file', path })),
      ),
    ),
    { concurrency: 'unbounded' },
  );
});
