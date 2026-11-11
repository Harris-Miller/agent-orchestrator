import { assert, describe, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';
import * as PlatformError from 'effect/PlatformError';

import { loadFileUriThumbnail } from './loadFileUriThumbnail.ts';

const unreadableFileSystem = layerNoop({
  readFile: path =>
    Effect.fail(
      PlatformError.systemError({ _tag: 'NotFound', method: 'readFile', module: 'FileSystem', pathOrDescriptor: path }),
    ),
});

const failureMessage = (fileUri: string) =>
  loadFileUriThumbnail(fileUri).pipe(
    Effect.flip,
    Effect.map(error => error.message),
    Effect.provide(Layer.mergeAll(posixPathLayer, unreadableFileSystem)),
  );

describe('loadFileUriThumbnail failure message keeps Private data out', () => {
  it.effect('a non-file URI', () =>
    Effect.gen(function* () {
      const message = yield* failureMessage('https://example.com/private/secret.png');
      assert.notInclude(message, 'secret');
    }),
  );

  it.effect('an unsupported file', () =>
    Effect.gen(function* () {
      const message = yield* failureMessage('file:///Users/someone/secret-notes.txt');
      assert.notInclude(message, 'someone');
      assert.notInclude(message, 'secret');
    }),
  );

  it.effect('an unreadable image', () =>
    Effect.gen(function* () {
      const message = yield* failureMessage('file:///Users/someone/secret.png');
      assert.notInclude(message, 'someone');
      assert.notInclude(message, 'secret');
    }),
  );
});
