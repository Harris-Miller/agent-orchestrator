/**
 * Host FileSystem read of a `file://` URI → base64 image data URL for `<img>`.
 */
import { Effect, Option, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { mimeTypeForImagePath } from './draftToContentBlocks.ts';
import { imageBytesToDataUrl } from './imageDataUrl.ts';

export class FileUriThumbnailFailed extends Schema.TaggedError<FileUriThumbnailFailed>()('FileUriThumbnailFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/** Resolve `file://…` → absolute path → read bytes → data URL. */
export const loadFileUriThumbnail = Effect.fn('loadFileUriThumbnail')(function* (fileUri: string) {
  if (!fileUri.startsWith('file://')) {
    return yield* new FileUriThumbnailFailed({ message: `Not a file:// URI: ${fileUri}` });
  }

  const pathApi = yield* Path;
  const fs = yield* FileSystem;

  const absolute = yield* pathApi.fromFileUrl(new URL(fileUri)).pipe(Effect.option);
  if (Option.isNone(absolute)) {
    return yield* new FileUriThumbnailFailed({ message: `Could not resolve path for ${fileUri}` });
  }

  const mimeType = mimeTypeForImagePath(absolute.value);
  if (mimeType === undefined) {
    return yield* new FileUriThumbnailFailed({ message: `Unsupported image file: ${fileUri}` });
  }

  const bytes = yield* fs
    .readFile(absolute.value)
    .pipe(Effect.mapError(cause => new FileUriThumbnailFailed({ cause, message: `Could not read ${fileUri}` })));

  return yield* Effect.try({
    catch: cause => new FileUriThumbnailFailed({ cause, message: `Could not encode ${fileUri}` }),
    try: () => imageBytesToDataUrl(bytes, mimeType),
  });
});
