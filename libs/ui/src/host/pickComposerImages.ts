/**
 * Native FileDialog → FileSystem.readFile → validated ComposerImageAttachment[].
 */
import { FileDialog } from '@lib/context-services';
import { Effect, Option } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import {
  IMAGE_ATTACH_MAX_BYTES_PER,
  IMAGE_ATTACH_MAX_COUNT,
  IMAGE_DIALOG_FILTERS,
  ImageAttachmentRejected,
  mimeTypeForImagePath,
  validateImageAttachments,
} from './draftToContentBlocks.ts';
import type { ComposerImageAttachment } from './draftToContentBlocks.ts';

const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const basenameForName = (pathApi: Path, absolutePath: string): string => {
  const trimmed = absolutePath.replace(/[/\\]+$/, '');
  const base = pathApi.basename(trimmed);
  return base.length > 0 ? base : trimmed;
};

const readPathAsAttachment = Effect.fn('pickComposerImages.readPathAsAttachment')(function* (absolutePath: string) {
  const pathApi = yield* Path;
  const fs = yield* FileSystem;

  const mimeType = mimeTypeForImagePath(absolutePath);
  if (mimeType === undefined) {
    return yield* new ImageAttachmentRejected({
      message: `Unsupported image file: ${basenameForName(pathApi, absolutePath)}`,
    });
  }

  const bytes = yield* fs.readFile(absolutePath).pipe(
    Effect.mapError(
      cause =>
        new ImageAttachmentRejected({
          cause,
          message: `Could not read ${basenameForName(pathApi, absolutePath)}`,
        }),
    ),
  );

  if (bytes.byteLength > IMAGE_ATTACH_MAX_BYTES_PER) {
    return yield* new ImageAttachmentRejected({
      message: `Image ${basenameForName(pathApi, absolutePath)} exceeds ${String(IMAGE_ATTACH_MAX_BYTES_PER / (1024 * 1024))} MiB`,
    });
  }

  const fileUrl = yield* pathApi.toFileUrl(absolutePath).pipe(Effect.option);
  if (Option.isNone(fileUrl)) {
    return yield* new ImageAttachmentRejected({
      message: `Could not build file:// URI for ${basenameForName(pathApi, absolutePath)}`,
    });
  }

  return {
    byteLength: bytes.byteLength,
    data: bytesToBase64(bytes),
    id: crypto.randomUUID(),
    mimeType,
    name: basenameForName(pathApi, absolutePath),
    uri: fileUrl.value.href,
  } satisfies ComposerImageAttachment;
});

/**
 * Open host file dialog, read selected paths, return attachments to append after `existing`.
 * Cancel → empty list. Cap/MIME failures → ImageAttachmentRejected.
 */
export const pickComposerImages = Effect.fn('pickComposerImages')(function* (
  existing: readonly ComposerImageAttachment[],
) {
  const dialog = yield* FileDialog;
  const paths = yield* dialog.pickFiles({
    filters: [...IMAGE_DIALOG_FILTERS],
    multiple: true,
  });
  if (paths.length === 0) {
    return [] as const;
  }

  if (existing.length + paths.length > IMAGE_ATTACH_MAX_COUNT) {
    return yield* new ImageAttachmentRejected({
      message: `At most ${String(IMAGE_ATTACH_MAX_COUNT)} images can be attached`,
    });
  }

  const picked: ComposerImageAttachment[] = [];
  for (const path of paths) {
    picked.push(yield* readPathAsAttachment(path));
  }

  yield* validateImageAttachments([...existing, ...picked]);
  return picked;
});
