import { assert, describe, it } from '@effect/vitest';

import { base64FromDataUrl, imageBytesToDataUrl, parseDataUrlBase64 } from './imageDataUrl.ts';

describe('imageBytesToDataUrl', () => {
  it('builds a data URL from bytes and mime', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    assert.strictEqual(imageBytesToDataUrl(bytes, 'image/png'), `data:image/png;base64,${btoa('\x89PNG')}`);
  });
});

describe('parseDataUrlBase64', () => {
  it('returns mime + payload', () => {
    assert.deepStrictEqual(parseDataUrlBase64('data:image/png;base64,thumb'), {
      data: 'thumb',
      mimeType: 'image/png',
    });
  });

  it('is case-insensitive on the data: / base64 markers', () => {
    assert.deepStrictEqual(parseDataUrlBase64('DATA:image/jpeg;BASE64,abc'), {
      data: 'abc',
      mimeType: 'image/jpeg',
    });
  });

  it('returns undefined for non data URLs', () => {
    assert.strictEqual(parseDataUrlBase64('file:///tmp/a.png'), undefined);
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
