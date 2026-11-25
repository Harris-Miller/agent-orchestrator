import { assert, describe, it } from '@effect/vitest';

import { join, resolve } from 'node:path';

import { assertAbsolutePath, samePath, sliceTextLines } from '../editorFilePaths';

describe('sliceTextLines', () => {
  const text = 'a\nb\r\nc\nd';

  it('returns the text untouched without a window', () => {
    assert.strictEqual(sliceTextLines(text), text);
    assert.strictEqual(sliceTextLines(text, null, null), text);
  });

  it('windows by 1-based line and limit, preserving line endings', () => {
    assert.strictEqual(sliceTextLines(text, 2, 2), 'b\r\nc\n');
    assert.strictEqual(sliceTextLines(text, 3), 'c\nd');
    assert.strictEqual(sliceTextLines(text, undefined, 1), 'a\n');
    assert.strictEqual(sliceTextLines(text, 4, 5), 'd');
  });

  it('gives empty text for limit 0, a line past the end, or empty input', () => {
    assert.strictEqual(sliceTextLines(text, 1, 0), '');
    assert.strictEqual(sliceTextLines(text, 9), '');
    assert.strictEqual(sliceTextLines('', 1, 3), '');
  });

  it('rejects a line below 1 and a negative limit', () => {
    assert.throws(() => sliceTextLines(text, 0), /Invalid line/);
    assert.throws(() => sliceTextLines(text, 1, -1), /Invalid limit/);
  });
});

describe('assertAbsolutePath / samePath', () => {
  it('rejects relative paths without echoing them', () => {
    assert.throws(() => assertAbsolutePath('secret/rel.ts'), /must be absolute/);
    try {
      assertAbsolutePath('secret/rel.ts');
    } catch (error) {
      assert.notInclude((error as Error).message, 'secret');
    }
    assertAbsolutePath(resolve('x'));
  });

  it('compares normalized paths', () => {
    const base = resolve('some', 'dir');
    assert.isTrue(samePath(join(base, 'a', '..', 'f.ts'), join(base, 'f.ts')));
    assert.isFalse(samePath(join(base, 'f.ts'), join(base, 'g.ts')));
  });
});
