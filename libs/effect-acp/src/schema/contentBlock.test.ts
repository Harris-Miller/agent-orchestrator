import { assert, describe, it } from '@effect/vitest';
import { Schema } from 'effect';

import { PromptRequest } from './agent.ts';
import { ContentBlock, ImageContentBlock } from './contentBlock.ts';

describe('ImageContentBlock', () => {
  it('round-trips encode/decode', () => {
    const encoded = Schema.encodeSync(ImageContentBlock)({
      data: 'iVBORw0KGgo=',
      mimeType: 'image/png',
      type: 'image',
      uri: 'file:///tmp/x.png',
    });
    const decoded = Schema.decodeSync(ImageContentBlock)(encoded);
    assert.strictEqual(decoded.type, 'image');
    assert.strictEqual(decoded.mimeType, 'image/png');
    assert.strictEqual(decoded.data, 'iVBORw0KGgo=');
    assert.strictEqual(decoded.uri, 'file:///tmp/x.png');
  });

  it('ContentBlock union accepts image', () => {
    const decoded = Schema.decodeSync(ContentBlock)({
      data: 'abc',
      mimeType: 'image/jpeg',
      type: 'image',
    });
    assert.strictEqual(decoded.type, 'image');
  });

  it('PromptRequest.prompt accepts mixed text + image', () => {
    const decoded = Schema.decodeSync(PromptRequest)({
      prompt: [
        { text: 'look', type: 'text' },
        { data: 'abc', mimeType: 'image/png', type: 'image', uri: 'file:///a.png' },
      ],
      sessionId: 's1',
    });
    assert.strictEqual(decoded.prompt.length, 2);
    assert.strictEqual(decoded.prompt[1]?.type, 'image');
  });
});
