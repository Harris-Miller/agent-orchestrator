import { assert, describe, it } from '@effect/vitest';

import { base64FromDataUrl, imageBytesToDataUrl } from './imageDataUrl.ts';

describe('imageBytesToDataUrl', () => {
  it('builds a data URL from bytes and mime', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    assert.strictEqual(imageBytesToDataUrl(bytes, 'image/png'), `data:image/png;base64,${btoa('\x89PNG')}`);
  });
});

describe('base64FromDataUrl', () => {
  it('strips mime + base64 payload', () => {
    assert.strictEqual(base64FromDataUrl('data:image/png;base64,thumb'), 'thumb');
  });

  it('returns undefined for non data URLs', () => {
    assert.strictEqual(base64FromDataUrl('file:///tmp/a.png'), undefined);
  });
});
