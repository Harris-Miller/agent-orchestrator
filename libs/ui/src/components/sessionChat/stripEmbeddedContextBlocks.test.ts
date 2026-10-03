import { assert, describe, it } from '@effect/vitest';

import { prepareChatMarkdownText, stripEmbeddedContextBlocks } from './stripEmbeddedContextBlocks.ts';

describe('stripEmbeddedContextBlocks', () => {
  it('removes context body so only surrounding prompt remains', () => {
    const input = [
      'Explain to me what the 2 dependencies in [@package.json](file:///tmp/package.json)',
      '<context ref="file:///tmp/package.json">',
      '{',
      '  "name": "acp-adapter-resources",',
      '  "dependencies": { "@agentclientprotocol/codex-acp": "1.8.0" }',
      '}',
      '',
      '</context>',
      'are for',
    ].join('\n');

    assert.strictEqual(
      stripEmbeddedContextBlocks(input),
      'Explain to me what the 2 dependencies in [@package.json](file:///tmp/package.json) are for',
    );
  });

  it('removes multiple context blocks', () => {
    assert.strictEqual(
      stripEmbeddedContextBlocks('a <context ref="x">one</context> b <context>two</context> c'),
      'a b c',
    );
  });

  it('leaves text without context tags unchanged', () => {
    assert.strictEqual(stripEmbeddedContextBlocks('plain [@file](file:///x) text'), 'plain [@file](file:///x) text');
  });
});

describe('prepareChatMarkdownText', () => {
  it('strips context and keeps @-prefixed FS labels', () => {
    const input = [
      'Explain what the two dependencies in [@package.json](file:///tmp/package.json)',
      '<context ref="file:///tmp/package.json">',
      '{ "name": "acp-adapter-resources" }',
      '</context>',
      'are for',
    ].join('\n');

    assert.strictEqual(
      prepareChatMarkdownText(input),
      'Explain what the two dependencies in [@package.json](file:///tmp/package.json) are for',
    );
  });
});
