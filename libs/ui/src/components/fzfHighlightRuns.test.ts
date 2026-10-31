import { assert, describe, it } from '@effect/vitest';

import { fzfHighlightRuns } from './fzfHighlightRuns.ts';

describe('fzfHighlightRuns', () => {
  it('returns one plain run when nothing is highlighted or bold', () => {
    assert.deepStrictEqual(fzfHighlightRuns('hello', new Set()), [
      { bold: false, highlighted: false, start: 0, text: 'hello' },
    ]);
  });

  it('groups contiguous and separate matches into runs', () => {
    assert.deepStrictEqual(fzfHighlightRuns('abcdef', new Set([1, 2, 4])), [
      { bold: false, highlighted: false, start: 0, text: 'a' },
      { bold: false, highlighted: true, start: 1, text: 'bc' },
      { bold: false, highlighted: false, start: 3, text: 'd' },
      { bold: false, highlighted: true, start: 4, text: 'e' },
      { bold: false, highlighted: false, start: 5, text: 'f' },
    ]);
  });

  it('splits at boldFrom and combines with highlights', () => {
    assert.deepStrictEqual(fzfHighlightRuns('src/app', new Set([3, 4]), 4), [
      { bold: false, highlighted: false, start: 0, text: 'src' },
      { bold: false, highlighted: true, start: 3, text: '/' },
      { bold: true, highlighted: true, start: 4, text: 'a' },
      { bold: true, highlighted: false, start: 5, text: 'pp' },
    ]);
  });

  it('returns no runs for empty text', () => {
    assert.deepStrictEqual(fzfHighlightRuns('', new Set()), []);
  });
});
