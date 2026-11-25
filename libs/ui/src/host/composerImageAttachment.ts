/**
 * Composer image attachment model: MIME allowlist, caps, validation, reading an image path into an attachment,
 * de-duplication by `uri`, and image-like `resource_link` detection. Prompt assembly lives in draftToContentBlocks.
 */
import { OpenableImageMimeType } from '@lib/context-services';
import type { ContentBlock } from '@lib/effect-acp';
import { Effect, Option, Schema } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { isRecord } from '../isRecord.ts';

import { base64FromDataUrl, imageBytesToDataUrl, parseDataUrlBase64 } from './imageDataUrl.ts';

/** MIME allowlist for composer image attachments (decoded bytes before base64). */
export const IMAGE_MIME_ALLOWLIST: ReadonlySet<string> = new Set(OpenableImageMimeType.literals);

export const IMAGE_ATTACH_MAX_COUNT = 10;
export const IMAGE_ATTACH_MAX_BYTES_PER = 5 * 1024 * 1024;
export const IMAGE_ATTACH_MAX_BYTES_TOTAL = 15 * 1024 * 1024;

export const IMAGE_DIALOG_FILTERS = [{ extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'], name: 'Images' }] as const;

/** Image path/uri extension check (gif/jpeg/png/webp). */
export const IMAGE_EXT_RE = /\.(gif|jpe?g|png|webp)(?:$|[?#])/i;

/** Draft-side image held for send (preview data URL + metadata; raw bytes not retained). */
export type ComposerImageAttachment = {
  readonly byteLength: number;
  readonly id: string;
  readonly mimeType: string;
  readonly name: string;
  /** `data:<mime>;base64,…` for composer / transcript `<img>` previews. */
  readonly previewDataUrl: string;
  /** Absent for pasted / dropped bytes (no filesystem path). */
  readonly uri?: string;
};

/** Attachments rejected (MIME / size / count / read / encode failure). */
export class ImageAttachmentRejected extends Schema.TaggedError<ImageAttachmentRejected>()('ImageAttachmentRejected', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/** Shown when paste / drop / attach targets an Agent without `promptCapabilities.image`. */
export const AGENT_NO_IMAGES_MESSAGE = 'This Agent does not accept images';

/** Count-cap rejection when `total` images would be attached; `undefined` within the cap. */
export const imageCountRejection = (total: number): ImageAttachmentRejected | undefined =>
  total > IMAGE_ATTACH_MAX_COUNT
    ? new ImageAttachmentRejected({ message: `At most ${String(IMAGE_ATTACH_MAX_COUNT)} images can be attached` })
    : undefined;

/** Per-image size rejection for `name` of `byteLength`; `undefined` within the cap. */
export const imageSizeRejection = (name: string, byteLength: number): ImageAttachmentRejected | undefined =>
  byteLength > IMAGE_ATTACH_MAX_BYTES_PER
    ? new ImageAttachmentRejected({
        message: `Image ${name} exceeds ${String(IMAGE_ATTACH_MAX_BYTES_PER / (1024 * 1024))} MiB`,
      })
    : undefined;

export const mimeTypeForImagePath = (path: string): string | undefined => {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) {
    return undefined;
  }
  switch (lower.slice(dot + 1)) {
    case 'gif':
      return 'image/gif';
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return undefined;
  }
};

export const isAllowedImageMimeType = (mimeType: string): boolean => IMAGE_MIME_ALLOWLIST.has(mimeType);

/** MIME from a `data:<mime>;base64,…` href when that mime is in the image allowlist. */
export const mimeTypeForDataImageHref = (href: string): string | undefined => {
  const parsed = parseDataUrlBase64(href);
  if (parsed === undefined) {
    return undefined;
  }
  const mimeType = parsed.mimeType.toLowerCase();
  return isAllowedImageMimeType(mimeType) ? mimeType : undefined;
};

/** True when a resource_link looks like an image (mime allowlist or image extension). */
export const isImageLikeResourceLink = (block: unknown): boolean => {
  if (!isRecord(block) || block.type !== 'resource_link') {
    return false;
  }
  if (typeof block.uri !== 'string' || typeof block.name !== 'string') {
    return false;
  }
  if (typeof block.mimeType === 'string' && IMAGE_MIME_ALLOWLIST.has(block.mimeType)) {
    return true;
  }
  return IMAGE_EXT_RE.test(block.name) || IMAGE_EXT_RE.test(block.uri);
};

/** First cap (count / per-image / total decoded bytes) the list breaks, or `undefined` when it is within all of them. */
export const imageAttachmentsRejection = (
  attachments: readonly ComposerImageAttachment[],
): ImageAttachmentRejected | undefined => {
  const countRejected = imageCountRejection(attachments.length);
  if (countRejected !== undefined) {
    return countRejected;
  }

  let total = 0;
  for (const attachment of attachments) {
    if (!isAllowedImageMimeType(attachment.mimeType)) {
      return new ImageAttachmentRejected({
        message: `Unsupported image type: ${attachment.mimeType}`,
      });
    }
    const sizeRejected = imageSizeRejection(attachment.name, attachment.byteLength);
    if (sizeRejected !== undefined) {
      return sizeRejected;
    }
    total += attachment.byteLength;
  }

  if (total > IMAGE_ATTACH_MAX_BYTES_TOTAL) {
    return new ImageAttachmentRejected({
      message: `Attached images exceed ${String(IMAGE_ATTACH_MAX_BYTES_TOTAL / (1024 * 1024))} MiB total`,
    });
  }

  return undefined;
};

/** Validate count / per-image / total decoded byte caps. Fail closed with {@link ImageAttachmentRejected}. */
export const validateImageAttachments = (
  attachments: readonly ComposerImageAttachment[],
): Effect.Effect<readonly ComposerImageAttachment[], ImageAttachmentRejected> => {
  const rejected = imageAttachmentsRejection(attachments);
  return rejected === undefined ? Effect.succeed(attachments) : Effect.fail(rejected);
};

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

  // The read error names the full path (Private data), so it is not kept as the cause.
  const bytes = yield* fs
    .readFile(absolutePath)
    .pipe(
      Effect.mapError(
        () => new ImageAttachmentRejected({ message: `Could not read ${basenameForName(pathApi, absolutePath)}` }),
      ),
    );

  const sizeRejected = imageSizeRejection(basenameForName(pathApi, absolutePath), bytes.byteLength);
  if (sizeRejected !== undefined) {
    return yield* sizeRejected;
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
  const seen = new Set(existing.flatMap(attachment => (attachment.uri === undefined ? [] : [attachment.uri])));
  const out = [...existing];
  for (const attachment of next) {
    if (attachment.uri === undefined) {
      out.push(attachment);
    } else if (!seen.has(attachment.uri)) {
      seen.add(attachment.uri);
      out.push(attachment);
    }
  }
  return out;
};

/** Fails closed for a uri-less attachment: pasted bytes are never sent as a `resource_link`. */
export const attachmentToResourceLinkBlock = (
  attachment: ComposerImageAttachment,
): Effect.Effect<ContentBlock, ImageAttachmentRejected> =>
  attachment.uri === undefined
    ? Effect.fail(
        new ImageAttachmentRejected({ message: `${attachment.name} cannot be sent: the Agent does not accept images` }),
      )
    : Effect.succeed({
        mimeType: attachment.mimeType,
        name: attachment.name,
        size: attachment.byteLength,
        type: 'resource_link',
        uri: attachment.uri,
      });

const EXT_FOR_MIME: Readonly<Record<string, string>> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Read a pasted / dropped `File` into a composer attachment (no `uri`). Caller pre-checks MIME and size. */
export const composerImageAttachmentFromFile = Effect.fn('composerImageAttachmentFromFile')(function* (file: File) {
  const mimeType = file.type.toLowerCase();
  const name = file.name.length > 0 ? file.name : `pasted-image.${EXT_FOR_MIME[mimeType] ?? 'png'}`;
  // No cause: the platform error may carry private data.
  const buffer = yield* Effect.tryPromise({
    catch: () => new ImageAttachmentRejected({ message: `Could not read ${name}` }),
    try: () => file.arrayBuffer(),
  });
  const bytes = new Uint8Array(buffer);
  const previewDataUrl = yield* Effect.try({
    catch: cause => new ImageAttachmentRejected({ cause, message: `Could not encode ${name}` }),
    try: () => imageBytesToDataUrl(bytes, mimeType),
  });
  return {
    byteLength: bytes.byteLength,
    id: crypto.randomUUID(),
    mimeType,
    name,
    previewDataUrl,
  } satisfies ComposerImageAttachment;
});

/**
 * ACP `type: "image"` from a composer attachment. Includes `uri` when the attachment has one
 * (pasted / dropped bytes have none).
 */
export const attachmentToImageBlock = (
  attachment: ComposerImageAttachment,
): Effect.Effect<ContentBlock, ImageAttachmentRejected> => {
  const data = base64FromDataUrl(attachment.previewDataUrl);
  if (data === undefined) {
    return Effect.fail(
      new ImageAttachmentRejected({
        message: `Image ${attachment.name} has no base64 preview data`,
      }),
    );
  }
  return Effect.succeed({
    data,
    mimeType: attachment.mimeType,
    type: 'image' as const,
    ...(attachment.uri === undefined ? {} : { uri: attachment.uri }),
  });
};
