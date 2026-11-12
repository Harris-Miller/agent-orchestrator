import { assert, describe, it } from '@effect/vitest';

import type { AvailableCommand } from '../../../../host/sessionUpdateReducer.ts';

import { splitComposerCommandSegments } from '../../chips/composerCommandTokens.ts';
import { prepareChatMarkdownText } from '../markdown/stripEmbeddedContextBlocks.ts';
import { segmentCopyText, userMessageMarkdown } from './userMessageClipboard.ts';

const commands = [
  { description: 'Show status', name: 'status' },
  { description: 'Compact context', name: 'compact' },
  { description: 'Caveman mode', name: '$caveman' },
] as const;

const userMessageSegments = (text: string, availableCommands: readonly AvailableCommand[]) =>
  splitComposerCommandSegments(prepareChatMarkdownText(text), availableCommands);

describe('user message chip segments', () => {
  it('chipifies multiple exact command matches and leaves non-matches as text', () => {
    assert.deepStrictEqual(userMessageSegments('run /status then $caveman please', commands), [
      { kind: 'text', value: 'run ' },
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' then ' },
      { kind: 'command', value: '$caveman' },
      { kind: 'text', value: ' please' },
    ]);
    assert.deepStrictEqual(userMessageSegments('hi /sta', commands), [{ kind: 'text', value: 'hi /sta' }]);
  });

  it('chipifies filesystem and URL markdown links', () => {
    assert.deepStrictEqual(userMessageSegments('see [readme](./README.md) and [docs](https://example.com)', commands), [
      { kind: 'text', value: 'see ' },
      { href: './README.md', kind: 'markdownLink', label: 'readme' },
      { kind: 'text', value: ' and ' },
      { href: 'https://example.com', kind: 'markdownLink', label: 'docs' },
    ]);
  });

  it('re-evaluates command chips when availableCommands changes', () => {
    const text = '/status /compact';
    assert.deepStrictEqual(userMessageSegments(text, [{ name: 'status' }]), [
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' /compact' },
    ]);
    assert.deepStrictEqual(userMessageSegments(text, [{ name: 'compact' }]), [
      { kind: 'text', value: '/status ' },
      { kind: 'command', value: '/compact' },
    ]);
  });

  it('strips embedded context before splitting', () => {
    assert.deepStrictEqual(
      userMessageSegments('before\n<context name="x">secret /status</context>\nafter /status', commands),
      [
        { kind: 'text', value: 'before after ' },
        { kind: 'command', value: '/status' },
      ],
    );
  });
});

describe('segmentCopyText', () => {
  it('uses invocation and full markdown link for clipboard parity with composer', () => {
    assert.strictEqual(segmentCopyText({ kind: 'command', value: '/status' }), '/status');
    assert.strictEqual(
      segmentCopyText({ href: 'file:///tmp/package.json', kind: 'markdownLink', label: '@package.json' }),
      '[@package.json](file:///tmp/package.json)',
    );
    assert.strictEqual(segmentCopyText({ kind: 'text', value: ' hello ' }), ' hello ');
  });
});

describe('userMessageMarkdown', () => {
  it('keeps plain Markdown untouched', () => {
    const source = '**bold** and `code`\n- a\n- b';
    assert.strictEqual(userMessageMarkdown(source, commands), source);
  });

  it('restores a command chip as its raw /name', () => {
    assert.strictEqual(userMessageMarkdown('run /status now', commands), 'run /status now');
  });

  it('restores a Markdown link chip as [label](href)', () => {
    assert.strictEqual(userMessageMarkdown('see [readme](./README.md) ok', commands), 'see [readme](./README.md) ok');
  });

  it('strips injected blocks', () => {
    assert.strictEqual(userMessageMarkdown('hi <system-reminder>x</system-reminder>', commands).trim(), 'hi');
    assert.strictEqual(userMessageMarkdown('<context name="x">only</context>', commands).trim(), '');
  });
});
