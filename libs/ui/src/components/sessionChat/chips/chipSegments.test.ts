import { assert, describe, it } from '@effect/vitest';

import type { AvailableCommand } from '../../../host/sessionUpdateReducer.ts';

import { commandInvocation, findExactCommandMatch, segmentText, splitChipSegments } from './chipSegments.ts';

const commands = [
  { description: 'Show status', name: 'status' },
  { description: 'Compact context', name: 'compact' },
  { description: 'Caveman mode', name: '$caveman' },
] as const;

describe('commandInvocation', () => {
  it('prefixes slash names and leaves $ names', () => {
    assert.strictEqual(commandInvocation('status'), '/status');
    assert.strictEqual(commandInvocation('$caveman'), '$caveman');
  });
});

describe('findExactCommandMatch', () => {
  it('matches invocation forms only', () => {
    assert.strictEqual(findExactCommandMatch('/status', commands)?.name, 'status');
    assert.strictEqual(findExactCommandMatch('$caveman', commands)?.name, '$caveman');
    assert.strictEqual(findExactCommandMatch('status', commands), undefined);
    assert.strictEqual(findExactCommandMatch('/sta', commands), undefined);
  });
});

describe('splitChipSegments', () => {
  it('chipifies exact matches including at EOF', () => {
    assert.deepStrictEqual(splitChipSegments('/status more', commands), [
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' more' },
    ]);
    assert.deepStrictEqual(splitChipSegments('/status ', commands), [
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' ' },
    ]);
    // Exact token at EOF stays a chip so Backspace removes it whole (not char-by-char).
    assert.deepStrictEqual(splitChipSegments('/status', commands), [{ kind: 'command', value: '/status' }]);
    assert.deepStrictEqual(splitChipSegments('$caveman', commands), [{ kind: 'command', value: '$caveman' }]);
    assert.deepStrictEqual(splitChipSegments('hi /sta', commands), [{ kind: 'text', value: 'hi /sta' }]);
    assert.deepStrictEqual(splitChipSegments('/status $caveman', commands), [
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' ' },
      { kind: 'command', value: '$caveman' },
    ]);
    assert.deepStrictEqual(splitChipSegments('/status $caveman ', commands), [
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' ' },
      { kind: 'command', value: '$caveman' },
      { kind: 'text', value: ' ' },
    ]);
  });

  it('chipifies markdown links inside tokens', () => {
    assert.deepStrictEqual(splitChipSegments('see [readme](./README.md) now', commands), [
      { kind: 'text', value: 'see ' },
      { href: './README.md', kind: 'markdownLink', label: 'readme' },
      { kind: 'text', value: ' now' },
    ]);
  });
});

const userMessageSegments = (text: string, availableCommands: readonly AvailableCommand[]) =>
  splitChipSegments(text, availableCommands);

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
});

describe('segmentText', () => {
  it('uses invocation and full markdown link for clipboard parity with composer', () => {
    assert.strictEqual(segmentText({ kind: 'command', value: '/status' }), '/status');
    assert.strictEqual(
      segmentText({ href: 'file:///tmp/package.json', kind: 'markdownLink', label: '@package.json' }),
      '[@package.json](file:///tmp/package.json)',
    );
    assert.strictEqual(segmentText({ kind: 'text', value: ' hello ' }), ' hello ');
  });
});

describe('segment round trip', () => {
  it('joining segmentText over the split restores the draft', () => {
    const draft = 'run /status then see [readme](./README.md) and $caveman  \n ok';
    const segments = splitChipSegments(draft, commands);
    assert.strictEqual(segments.map(segmentText).join(''), draft);
    assert.deepStrictEqual(
      new Set(segments.map(segment => segment.kind)),
      new Set(['text', 'command', 'markdownLink']),
    );
  });
});
