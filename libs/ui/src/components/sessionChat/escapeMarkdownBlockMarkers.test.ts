import { assert, describe, it } from '@effect/vitest';

import { escapeMarkdownBlockMarkers, hasInlineMarkdown } from './escapeMarkdownBlockMarkers.ts';

describe('escapeMarkdownBlockMarkers', () => {
  it('escapes a lone bullet marker', () => {
    assert.strictEqual(escapeMarkdownBlockMarkers('*'), '\\*');
  });

  it('escapes a bullet marker after a newline', () => {
    assert.strictEqual(escapeMarkdownBlockMarkers('chat:\n*'), 'chat:\n\\*');
  });

  it('escapes - and + bullet markers', () => {
    assert.strictEqual(escapeMarkdownBlockMarkers('- a\n+ b'), '\\- a\n\\+ b');
  });

  it('escapes ordered list punctuation', () => {
    assert.strictEqual(escapeMarkdownBlockMarkers('1. x'), '1\\. x');
    assert.strictEqual(escapeMarkdownBlockMarkers('2) y'), '2\\) y');
  });

  it('escapes ATX headings', () => {
    assert.strictEqual(escapeMarkdownBlockMarkers('## h'), '\\## h');
  });

  it('escapes block quotes', () => {
    assert.strictEqual(escapeMarkdownBlockMarkers('> q'), '\\> q');
  });

  it('escapes thematic breaks', () => {
    assert.strictEqual(escapeMarkdownBlockMarkers('---'), '\\---');
  });

  it('escapes setext underlines', () => {
    assert.strictEqual(escapeMarkdownBlockMarkers('==='), '\\===');
  });

  it('leaves inline syntax alone', () => {
    assert.strictEqual(escapeMarkdownBlockMarkers('**bold**'), '**bold**');
    assert.strictEqual(escapeMarkdownBlockMarkers('a * b'), 'a * b');
    assert.strictEqual(escapeMarkdownBlockMarkers('*emph*'), '*emph*');
    assert.strictEqual(escapeMarkdownBlockMarkers('`code`'), '`code`');
    assert.strictEqual(escapeMarkdownBlockMarkers('#tag'), '#tag');
  });
});

describe('hasInlineMarkdown', () => {
  it('detects inline markdown characters', () => {
    assert.isTrue(hasInlineMarkdown('**bold**'));
    assert.isTrue(hasInlineMarkdown('[link]'));
  });

  it('ignores plain text', () => {
    assert.isFalse(hasInlineMarkdown('plain text'));
  });
});
