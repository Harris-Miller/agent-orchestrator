import { assert, describe, it } from '@effect/vitest';

import { toolCallTitleSegments } from './toolCallTitleSegments.ts';

describe('toolCallTitleSegments', () => {
  it('links the URL in a Claude Fetch title', () => {
    assert.deepStrictEqual(toolCallTitleSegments('Fetch https://a.dev/x?y=1', 'fetch', undefined), [
      { text: 'Fetch ' },
      { href: 'https://a.dev/x?y=1', text: 'https://a.dev/x?y=1' },
    ]);
  });

  it('links the URL in Codex search titles', () => {
    assert.deepStrictEqual(toolCallTitleSegments("Find 'foo' in page in https://a.dev", 'search', undefined), [
      { text: "Find 'foo' in page in " },
      { href: 'https://a.dev', text: 'https://a.dev' },
    ]);
  });

  it('leaves URL-less search titles plain', () => {
    assert.deepStrictEqual(toolCallTitleSegments('grep foo', 'search', undefined), [{ text: 'grep foo' }]);
  });

  it('links the quoted path in a Codex read title', () => {
    assert.deepStrictEqual(toolCallTitleSegments("Read file 'src/a.ts'", 'read', '/r/src/a.ts'), [
      { text: "Read file '" },
      { href: '/r/src/a.ts', text: 'src/a.ts' },
      { text: "'" },
    ]);
  });

  it('links the path after the verb in a Claude read title, excluding the range', () => {
    assert.deepStrictEqual(toolCallTitleSegments('Read /r/src/a.ts (1 - 50)', 'read', '/r/src/a.ts'), [
      { text: 'Read ' },
      { href: '/r/src/a.ts', text: '/r/src/a.ts' },
      { text: ' (1 - 50)' },
    ]);
  });

  it('keeps read titles plain without a location', () => {
    assert.deepStrictEqual(toolCallTitleSegments('Read x', 'read', undefined), [{ text: 'Read x' }]);
  });

  it('keeps other kinds plain', () => {
    assert.deepStrictEqual(toolCallTitleSegments('ls https://a.dev', 'execute', undefined), [
      { text: 'ls https://a.dev' },
    ]);
  });
});
