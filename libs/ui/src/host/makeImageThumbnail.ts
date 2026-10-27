/**
 * Downscale image bytes to a JPEG data URL for composer / transcript previews.
 * Jimp's PNG/JPEG decoders expect a Node-shaped Buffer (`readUInt32BE`); use `buffer` polyfill for webviews.
 */
import * as jimp from 'jimp';

import { Buffer } from 'buffer';

export const THUMBNAIL_MAX_EDGE = 256;
/** Jimp JPEG quality 0–100; plan ≈0.7 → 70. */
export const THUMBNAIL_JPEG_QUALITY = 70;

/** Decode `bytes`, fit within {@link THUMBNAIL_MAX_EDGE}, return `data:image/jpeg;base64,…`. */
export const makeImageThumbnail = async (bytes: Uint8Array): Promise<string> => {
  const image = await jimp.Jimp.fromBuffer(Buffer.from(bytes));
  if (image.width > THUMBNAIL_MAX_EDGE || image.height > THUMBNAIL_MAX_EDGE) {
    image.scaleToFit({ h: THUMBNAIL_MAX_EDGE, w: THUMBNAIL_MAX_EDGE });
  }
  return await image.getBase64('image/jpeg', { quality: THUMBNAIL_JPEG_QUALITY });
};
