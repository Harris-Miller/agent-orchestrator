/**
 * Composer image attachment model: MIME allowlist, caps, validation, and
 * image-like `resource_link` detection. Prompt assembly lives in draftToContentBlocks.
 */
import type { ContentBlock } from '@libs/effect-acp';
import { Effect, Schema } from 'effect';

import { isRecord } from '../isRecord.ts';

import { base64FromDataUrl, parseDataUrlBase64 } from './imageDataUrl.ts';

/** MIME allowlist for composer image attachments (decoded bytes before base64). */
export const IMAGE_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

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
  readonly uri: string;
};

/** Attachments rejected (MIME / size / count / read / encode failure). */
export class ImageAttachmentRejected extends Schema.TaggedError<ImageAttachmentRejected>()('ImageAttachmentRejected', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

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

/** Validate count / per-image / total decoded byte caps. Fail closed with {@link ImageAttachmentRejected}. */
export const validateImageAttachments = (
  attachments: readonly ComposerImageAttachment[],
): Effect.Effect<readonly ComposerImageAttachment[], ImageAttachmentRejected> => {
  if (attachments.length > IMAGE_ATTACH_MAX_COUNT) {
    return Effect.fail(
      new ImageAttachmentRejected({
        message: `At most ${String(IMAGE_ATTACH_MAX_COUNT)} images can be attached`,
      }),
    );
  }

  let total = 0;
  for (const attachment of attachments) {
    if (!isAllowedImageMimeType(attachment.mimeType)) {
      return Effect.fail(
        new ImageAttachmentRejected({
          message: `Unsupported image type: ${attachment.mimeType}`,
        }),
      );
    }
    if (attachment.byteLength > IMAGE_ATTACH_MAX_BYTES_PER) {
      return Effect.fail(
        new ImageAttachmentRejected({
          message: `Image ${attachment.name} exceeds ${String(IMAGE_ATTACH_MAX_BYTES_PER / (1024 * 1024))} MiB`,
        }),
      );
    }
    total += attachment.byteLength;
  }

  if (total > IMAGE_ATTACH_MAX_BYTES_TOTAL) {
    return Effect.fail(
      new ImageAttachmentRejected({
        message: `Attached images exceed ${String(IMAGE_ATTACH_MAX_BYTES_TOTAL / (1024 * 1024))} MiB total`,
      }),
    );
  }

  return Effect.succeed(attachments);
};

export const attachmentToResourceLinkBlock = (attachment: ComposerImageAttachment): ContentBlock => ({
  mimeType: attachment.mimeType,
  name: attachment.name,
  size: attachment.byteLength,
  type: 'resource_link',
  uri: attachment.uri,
});

/**
 * ACP `type: "image"` from a composer attachment. Always includes `uri` (Composer send contract);
 * schema keeps `uri` optional for inbound/history.
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
    uri: attachment.uri,
  });
};
