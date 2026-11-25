import type { Effect } from 'effect';
import { Context, Schema } from 'effect';

/** Host could not read or write a text file through its editor. */
export class EditorFilesFailed extends Schema.TaggedError<EditorFilesFailed>()('EditorFilesFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/** Optional line window for {@link EditorFiles.readText}: `line` is the 1-based first line, `limit` the max line count. */
export interface EditorFilesReadWindow {
  readonly limit?: number;
  readonly line?: number;
}

/** Portable text file access through the Host editor's documents (open, unsaved content wins over disk). */
export interface EditorFiles {
  readonly supported: boolean;
  readonly readText: (path: string, window?: EditorFilesReadWindow) => Effect.Effect<string, EditorFilesFailed>;
  readonly writeText: (path: string, content: string) => Effect.Effect<void, EditorFilesFailed>;
}

export const EditorFiles = Context.Service<EditorFiles>('EditorFiles');
