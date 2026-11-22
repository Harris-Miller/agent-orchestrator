import { describe, expect, it } from 'vitest';

import { clampScale, MAX_SCALE, RESET_VIEW, zoomAt } from './imageLightboxZoom.ts';

describe('imageLightboxZoom', () => {
  it('clamps scale to [1, 8]', () => {
    expect(clampScale(0.2)).toBe(1);
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(3)).toBe(3);
  });

  it('zooms about the center without moving the offset', () => {
    expect(zoomAt(RESET_VIEW, 2, { x: 0, y: 0 })).toEqual({ scale: 2, x: 0, y: 0 });
  });

  it('keeps the anchor point fixed', () => {
    expect(zoomAt(RESET_VIEW, 2, { x: 100, y: 50 })).toEqual({ scale: 2, x: -100, y: -50 });
  });

  it('resets offset when zooming back to min scale', () => {
    expect(zoomAt({ scale: 2, x: 40, y: 10 }, 0.5, { x: 5, y: 5 })).toEqual(RESET_VIEW);
  });

  it('does not exceed max scale', () => {
    expect(zoomAt({ scale: 8, x: 1, y: 2 }, 2, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
  });
});
