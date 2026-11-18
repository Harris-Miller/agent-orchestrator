import { assert, describe, it } from '@effect/vitest';

import { splitChipSegments } from '../../chips/chipSegments.ts';
import { prepareChatMarkdownText } from '../markdown/stripEmbeddedContextBlocks.ts';
import { chipSegmentsMarkdown, userMessageMarkdown } from './userMessageClipboard.ts';

const commands = [
  { description: 'Show status', isSkill: false, name: 'status' },
  { description: 'Compact context', isSkill: false, name: 'compact' },
  { description: 'Caveman mode', isSkill: true, name: '$caveman' },
] as const;

describe('user message chip segments', () => {
  it('strips embedded context before splitting', () => {
    assert.deepStrictEqual(
      splitChipSegments(
        prepareChatMarkdownText('before\n<context name="x">secret /status</context>\nafter /status'),
        commands,
      ),
      [
        { kind: 'text', value: 'before after ' },
        { kind: 'command', value: '/status' },
      ],
    );
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

describe('chipSegmentsMarkdown', () => {
  it('rebuilds raw source from split segments', () => {
    const source = 'run /status see [readme](./README.md)';
    assert.strictEqual(chipSegmentsMarkdown(splitChipSegments(source, commands)), source);
  });
});
