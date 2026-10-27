import { FileDialog, FileDialogFailed } from '@lib/context-services';
import type { PickFilesOptions } from '@lib/context-services';
import { open } from '@tauri-apps/plugin-dialog';
import { Effect, Layer } from 'effect';

const normalizePaths = (selected: null | string | string[]): readonly string[] => {
  if (selected === null) {
    return [];
  }
  return typeof selected === 'string' ? [selected] : selected;
};

/** Tauri Live for {@link FileDialog}: wraps `@tauri-apps/plugin-dialog` `open` (files only). */
export const FileDialogLive = Layer.succeed(FileDialog, {
  pickFiles: Effect.fn('FileDialog.pickFiles')(function* (options?: PickFilesOptions) {
    return yield* Effect.tryPromise({
      catch: cause =>
        new FileDialogFailed({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      try: async () => {
        const selected = await open({
          directory: false,
          filters:
            options?.filters === undefined
              ? undefined
              : options.filters.map(filter => ({
                  extensions: [...filter.extensions],
                  name: filter.name,
                })),
          multiple: options?.multiple === true,
        });
        return normalizePaths(selected);
      },
    });
  }),
});
