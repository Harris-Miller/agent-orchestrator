import { AtomicFile, atomicReplaceFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

/** VS Code webview Live for {@link AtomicFile}: Host IPC → extension temp-file + rename. */
export const makeAtomicFileLive = (client: IpcClient): Layer.Layer<AtomicFile> =>
  Layer.succeed(AtomicFile, {
    replaceFileString: Effect.fn('AtomicFile.replaceFileString')(function* (path: string, content: string) {
      yield* client
        .request(id => ({ _tag: 'FsAtomicReplaceFileString', content, id, path }))
        .pipe(Effect.mapError(cause => atomicReplaceFailed(path, cause)));
    }),
  });
