import { assert, describe, it } from '@effect/vitest';

import { imageBytesToDataUrl } from './imageDataUrl.ts';

describe('imageBytesToDataUrl', () => {
  it('builds a data URL from bytes and mime', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    assert.strictEqual(imageBytesToDataUrl(bytes, 'image/png'), `data:image/png;base64,${btoa('\x89PNG')}`);
  });
});
