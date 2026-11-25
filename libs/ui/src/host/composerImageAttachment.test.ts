import { assert, describe, it } from '@effect/vitest';

import { appendUniqueComposerAttachments } from './composerImageAttachment.ts';
import type { ComposerImageAttachment } from './composerImageAttachment.ts';

const att = (id: string, uri?: string): ComposerImageAttachment => ({
  byteLength: 1,
  id,
  mimeType: 'image/png',
  name: `${id}.png`,
  previewDataUrl: 'data:image/png;base64,AA==',
  ...(uri === undefined ? {} : { uri }),
});

describe('appendUniqueComposerAttachments', () => {
  it('dedupes by uri, first wins', () => {
    const out = appendUniqueComposerAttachments([att('a', 'u')], [att('b', 'u'), att('c', 'v')]);
    assert.deepStrictEqual(
      out.map(a => a.id),
      ['a', 'c'],
    );
  });
  it('never dedupes uri-less attachments', () => {
    const out = appendUniqueComposerAttachments([att('a')], [att('b'), att('c')]);
    assert.strictEqual(out.length, 3);
  });
});
