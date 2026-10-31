import { assert, describe, it } from '@effect/vitest';

import { escapeMarkdownBlockMarkers } from './escapeMarkdownBlockMarkers.ts';

describe('escapeMarkdownBlockMarkers', () => {
  it('escapes block markers', () => {
    assert.strictEqual(escapeMarkdownBlockMarkers('*'), '\\*');
    assert.strictEqual(escapeMarkdownBlockMarkers('chat:\n*'), 'chat:\n\\*');
    assert.strictEqual(escapeMarkdownBlockMarkers('- a\n+ b'), '\\- a\n\\+ b');
    assert.strictEqual(escapeMarkdownBlockMarkers('1. x'), '1\\. x');
    assert.strictEqual(escapeMarkdownBlockMarkers('2) y'), '2\\) y');
    assert.strictEqual(escapeMarkdownBlockMarkers('## h'), '\\## h');
    assert.strictEqual(escapeMarkdownBlockMarkers('> q'), '\\> q');
    assert.strictEqual(escapeMarkdownBlockMarkers('---'), '\\---');
    assert.strictEqual(escapeMarkdownBlockMarkers('==='), '\\===');
  });

  it('leaves inline syntax alone', () => {
    for (const s of ['**bold**', 'a * b', '*emph*', '`code`', '#tag']) {
      assert.strictEqual(escapeMarkdownBlockMarkers(s), s);
    }
  });
});
