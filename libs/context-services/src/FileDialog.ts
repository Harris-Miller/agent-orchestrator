import type { Effect } from 'effect';
import { Context, Schema } from 'effect';

/** Host could not open or complete a native file-open dialog. */
export class FileDialogFailed extends Schema.TaggedError<FileDialogFailed>()('FileDialogFailed', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/** Extension filter shown in the host open dialog (`extensions` without leading `.`). */
export type FileDialogFilter = {
  readonly extensions: readonly string[];
  readonly name: string;
};

export type PickFilesOptions = {
  readonly filters?: readonly FileDialogFilter[];
  readonly multiple?: boolean;
};

/** Mutable filter copy for host dialog APIs that take owned `extensions` arrays. */
export const cloneFileDialogFilters = (
  filters: readonly FileDialogFilter[],
): { extensions: string[]; name: string }[] =>
  filters.map(filter => ({
    extensions: [...filter.extensions],
    name: filter.name,
  }));

/**
 * Portable native open-file dialog — returns absolute filesystem paths.
 * Cancel → empty list. Does not read bytes (caller uses FileSystem).
 */
export interface FileDialog {
  readonly pickFiles: (options?: PickFilesOptions) => Effect.Effect<readonly string[], FileDialogFailed>;
}

export const FileDialog = Context.Service<FileDialog>('FileDialog');
