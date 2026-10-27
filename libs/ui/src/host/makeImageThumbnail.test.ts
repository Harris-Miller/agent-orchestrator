import { assert, describe, it } from '@effect/vitest';

import { makeImageThumbnail, THUMBNAIL_MAX_EDGE } from './makeImageThumbnail.ts';

describe('makeImageThumbnail', () => {
  it('returns a jpeg data URL for a tiny PNG', async () => {
    const jimp = await import('jimp');
    const tiny = new jimp.Jimp({ color: 0xff0000ff, height: 2, width: 2 });
    const bytes = new Uint8Array(await tiny.getBuffer('image/png'));
    const dataUrl = await makeImageThumbnail(bytes);
    assert.ok(dataUrl.startsWith('data:image/jpeg;base64,'));
    assert.ok(dataUrl.length > 'data:image/jpeg;base64,'.length);
  });

  it('fits large images within max edge', async () => {
    const jimp = await import('jimp');
    const large = new jimp.Jimp({ color: 0xff0000ff, height: 800, width: 600 });
    const bytes = new Uint8Array(await large.getBuffer('image/png'));
    const dataUrl = await makeImageThumbnail(bytes);
    const thumb = await jimp.Jimp.read(dataUrl);
    assert.isAtMost(thumb.width, THUMBNAIL_MAX_EDGE);
    assert.isAtMost(thumb.height, THUMBNAIL_MAX_EDGE);
  });
});
