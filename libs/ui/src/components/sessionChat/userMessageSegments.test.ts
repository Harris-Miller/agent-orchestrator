import { assert, describe, it } from '@effect/vitest';

import { prepareUserMessageSegments } from './userMessageSegments.ts';

const commands = [
  { description: 'Show status', name: 'status' },
  { description: 'Compact context', name: 'compact' },
  { description: 'Caveman mode', name: '$caveman' },
] as const;

describe('prepareUserMessageSegments', () => {
  it('chipifies multiple exact command matches and leaves non-matches as text', () => {
    assert.deepStrictEqual(prepareUserMessageSegments('run /status then $caveman please', commands), [
      { kind: 'text', value: 'run ' },
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' then ' },
      { kind: 'command', value: '$caveman' },
      { kind: 'text', value: ' please' },
    ]);
    assert.deepStrictEqual(prepareUserMessageSegments('hi /sta', commands), [{ kind: 'text', value: 'hi /sta' }]);
  });

  it('chipifies filesystem and URL markdown links', () => {
    assert.deepStrictEqual(
      prepareUserMessageSegments('see [readme](./README.md) and [docs](https://example.com)', commands),
      [
        { kind: 'text', value: 'see ' },
        { href: './README.md', kind: 'markdownLink', label: 'readme' },
        { kind: 'text', value: ' and ' },
        { href: 'https://example.com', kind: 'markdownLink', label: 'docs' },
      ],
    );
  });

  it('re-evaluates command chips when availableCommands changes', () => {
    const text = '/status /compact';
    assert.deepStrictEqual(prepareUserMessageSegments(text, [{ name: 'status' }]), [
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' /compact' },
    ]);
    assert.deepStrictEqual(prepareUserMessageSegments(text, [{ name: 'compact' }]), [
      { kind: 'text', value: '/status ' },
      { kind: 'command', value: '/compact' },
    ]);
  });

  it('strips embedded context before splitting', () => {
    assert.deepStrictEqual(
      prepareUserMessageSegments('before\n<context name="x">secret /status</context>\nafter /status', commands),
      [
        { kind: 'text', value: 'before after ' },
        { kind: 'command', value: '/status' },
      ],
    );
  });
});
