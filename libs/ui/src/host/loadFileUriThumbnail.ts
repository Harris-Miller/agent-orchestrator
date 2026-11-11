/**
 * Host FileSystem read of a `file://` URI → base64 image data URL for `<img>`.
 */
import { Effect, Option, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { mimeTypeForImagePath } from './composerImageAttachment.ts';
import { imageBytesToDataUrl } from './imageDataUrl.ts';

export class FileUriThumbnailFailed extends Schema.TaggedError<FileUriThumbnailFailed>()('FileUriThumbnailFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/** Resolve `file://…` → absolute path → read bytes → data URL. */
export const loadFileUriThumbnail = Effect.fn('loadFileUriThumbnail')(function* (fileUri: string) {
  if (!fileUri.startsWith('file://')) {
    return yield* new FileUriThumbnailFailed({ message: 'Not a file:// URI' });
  }

  const pathApi = yield* Path;
  const fs = yield* FileSystem;

  const absolute = yield* pathApi.fromFileUrl(new URL(fileUri)).pipe(Effect.option);
  if (Option.isNone(absolute)) {
    return yield* new FileUriThumbnailFailed({ message: 'Could not resolve the file path' });
  }

  const mimeType = mimeTypeForImagePath(absolute.value);
  if (mimeType === undefined) {
    return yield* new FileUriThumbnailFailed({ message: 'Unsupported image file' });
  }

  // The read error names the path (Private data), so it is not kept as the cause.
  const bytes = yield* fs
    .readFile(absolute.value)
    .pipe(Effect.mapError(() => new FileUriThumbnailFailed({ message: 'Could not read the image' })));

  return yield* Effect.try({
    catch: cause => new FileUriThumbnailFailed({ cause, message: 'Could not encode the image' }),
    try: () => imageBytesToDataUrl(bytes, mimeType),
  });
});
