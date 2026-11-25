import { EditorFiles, EditorFilesFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

const fail = (cause: unknown) =>
  new EditorFilesFailed({ cause, message: cause instanceof Error ? cause.message : String(cause) });

/** VS Code webview Live for {@link EditorFiles}: Host IPC → extension `TextDocument` / disk. */
export const makeEditorFilesLive = (client: IpcClient): Layer.Layer<EditorFiles> =>
  Layer.succeed(EditorFiles, {
    readText: (path, window) =>
      client
        .request({
          _tag: 'EditorReadTextFile',
          path,
          ...(window?.line === undefined ? {} : { line: window.line }),
          ...(window?.limit === undefined ? {} : { limit: window.limit }),
        })
        .pipe(
          Effect.map(result => result.content),
          Effect.mapError(fail),
        ),
    supported: true,
    writeText: (path, content) =>
      client.request({ _tag: 'EditorWriteTextFile', content, path }).pipe(Effect.asVoid, Effect.mapError(fail)),
  });
