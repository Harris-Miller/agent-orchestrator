import type { Effect } from 'effect';
import { Context, Schema } from 'effect';

/** Host could not open a file in its editor. */
export class OpenFileFailed extends Schema.TaggedError<OpenFileFailed>()('OpenFileFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/** Portable editor opener. */
export interface OpenFile {
  readonly supported: boolean;
  readonly open: (path: string) => Effect.Effect<void, OpenFileFailed>;
  /** Open in-memory image bytes (base64, no data-URL prefix) via a Host temp file. */
  readonly openImageData: (mimeType: string, base64: string) => Effect.Effect<void, OpenFileFailed>;
}

export const OpenFile = Context.Service<OpenFile>('OpenFile');
