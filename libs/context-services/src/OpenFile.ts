import type { Effect } from 'effect';
import { Context, Schema } from 'effect';

/** Host could not open a file in its editor. */
export class OpenFileFailed extends Schema.TaggedError<OpenFileFailed>()('OpenFileFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/** Image MIME types a Host can open from in-memory bytes. */
export const OpenableImageMimeType = Schema.Literals(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
export type OpenableImageMimeType = typeof OpenableImageMimeType.Type;

/** File extension a Host gives an {@link OpenableImageMimeType} when writing it to disk. */
export const openableImageExtension: Readonly<Record<OpenableImageMimeType, string>> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** In-memory image: base64 payload (no data-URL prefix) and its MIME type. */
export const Base64Image = Schema.Struct({ base64: Schema.String, mimeType: OpenableImageMimeType });
export type Base64Image = typeof Base64Image.Type;

/** Portable editor opener. */
export interface OpenFile {
  readonly supported: boolean;
  readonly open: (path: string) => Effect.Effect<void, OpenFileFailed>;
  /** Open an in-memory image via a Host temp file. */
  readonly openImageData: (image: Base64Image) => Effect.Effect<void, OpenFileFailed>;
}

export const OpenFile = Context.Service<OpenFile>('OpenFile');
