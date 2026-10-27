/**
 * Native FileDialog → FileSystem.readFile → base64 data URL → ComposerImageAttachment[].
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
} from './composerImageAttachment.ts';
import type { ComposerImageAttachment } from './composerImageAttachment.ts';
import { imageBytesToDataUrl } from './imageDataUrl.ts';

const basenameForName = (pathApi: Path, absolutePath: string): string => {
  const trimmed = absolutePath.replace(/[/\\]+$/, '');
  const base = pathApi.basename(trimmed);
  return base.length > 0 ? base : trimmed;
};

/** Read one absolute image path into a composer attachment (preview data URL). */
export const composerImageAttachmentFromPath = Effect.fn('composerImageAttachmentFromPath')(function* (
  absolutePath: string,
) {
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

  const previewDataUrl = yield* Effect.try({
    catch: cause =>
      new ImageAttachmentRejected({
        cause,
        message: `Could not encode ${basenameForName(pathApi, absolutePath)}`,
      }),
    try: () => imageBytesToDataUrl(bytes, mimeType),
  });

  return {
    byteLength: bytes.byteLength,
    id: crypto.randomUUID(),
    mimeType,
    name: basenameForName(pathApi, absolutePath),
    previewDataUrl,
    uri: fileUrl.value.href,
  } satisfies ComposerImageAttachment;
});

/** Append attachments that are not already present by `uri` (first wins). */
export const appendUniqueComposerAttachments = (
  existing: readonly ComposerImageAttachment[],
  next: readonly ComposerImageAttachment[],
): readonly ComposerImageAttachment[] => {
  const seen = new Set(existing.map(attachment => attachment.uri));
  const out = [...existing];
  for (const attachment of next) {
    if (!seen.has(attachment.uri)) {
      seen.add(attachment.uri);
      out.push(attachment);
    }
  }
  return out;
};

/**
 * Read absolute paths into attachments, merge with `existing` by uri, validate.
 * Returns `undefined` when every path was already attached (nothing new).
 */
export const mergeComposerAttachmentsFromPaths = Effect.fn('mergeComposerAttachmentsFromPaths')(function* (
  existing: readonly ComposerImageAttachment[],
  absolutePaths: readonly string[],
) {
  if (absolutePaths.length === 0) {
    return undefined;
  }

  const picked = yield* Effect.forEach(absolutePaths, composerImageAttachmentFromPath, {
    concurrency: 'unbounded',
  });
  const merged = appendUniqueComposerAttachments(existing, picked);
  if (merged.length === existing.length) {
    return undefined;
  }
  yield* validateImageAttachments(merged);
  return merged;
});

/**
 * Open host file dialog, read selected paths, return merged attachments (or undefined on cancel / no new).
 * Cap/MIME/encode failures → ImageAttachmentRejected.
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
    return undefined;
  }

  if (existing.length + paths.length > IMAGE_ATTACH_MAX_COUNT) {
    return yield* new ImageAttachmentRejected({
      message: `At most ${String(IMAGE_ATTACH_MAX_COUNT)} images can be attached`,
    });
  }

  return yield* mergeComposerAttachmentsFromPaths(existing, paths);
});
