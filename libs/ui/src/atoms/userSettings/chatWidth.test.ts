import { assert, describe, it } from '@effect/vitest';

import { chatWidthMode } from './userSettingsDocument.atoms.ts';

describe('chatWidthMode', () => {
  it('defaults to comfortable when unset', () => {
    assert.strictEqual(chatWidthMode({}), 'comfortable');
  });

  it('reflects wide and full', () => {
    assert.strictEqual(chatWidthMode({ chatWidth: 'wide' }), 'wide');
    assert.strictEqual(chatWidthMode({ chatWidth: 'full' }), 'full');
  });
});
