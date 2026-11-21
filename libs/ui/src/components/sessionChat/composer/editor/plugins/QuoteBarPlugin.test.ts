import { describe, expect, it } from 'vitest';

import { countVisualLines } from './QuoteBarPlugin.tsx';

const rect = (top: number, width = 10, height = 18) => ({ height, top, width });

describe('countVisualLines', () => {
  it('is 1 with no rects', () => {
    expect(countVisualLines([])).toBe(1);
  });

  it('is 1 for one rect', () => {
    expect(countVisualLines([rect(0)])).toBe(1);
  });

  it('merges rects on the same top within 1px', () => {
    expect(countVisualLines([rect(10), rect(10.5), rect(11)])).toBe(1);
  });

  it('counts distinct tops', () => {
    expect(countVisualLines([rect(0), rect(18), rect(36), rect(36)])).toBe(3);
  });

  it('ignores zero-size rects', () => {
    expect(countVisualLines([rect(0), rect(18, 0), rect(36, 10, 0)])).toBe(1);
  });
});
