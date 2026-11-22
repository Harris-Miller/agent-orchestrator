import { describe, expect, it } from 'vitest';

import { clampPan, clampScale, MAX_SCALE, RESET_VIEW, wheelFactor, zoomAt } from './imageLightboxZoom.ts';

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

  it('clamps pan so the image edge stays within the viewport center', () => {
    const bounds = { height: 100, width: 200 };
    expect(clampPan({ scale: 2, x: 9999, y: -9999 }, bounds)).toEqual({ scale: 2, x: 200, y: -100 });
    expect(clampPan({ scale: 2, x: 30, y: -10 }, bounds)).toEqual({ scale: 2, x: 30, y: -10 });
  });

  it('resets a stale offset at min scale', () => {
    expect(clampPan({ scale: 1, x: 50, y: 50 }, { height: 100, width: 100 })).toEqual(RESET_VIEW);
  });

  it('scales wheel zoom by delta and clamps per event', () => {
    expect(wheelFactor(0)).toBe(1);
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-100)).toBeLessThan(wheelFactor(-200));
    expect(wheelFactor(-100000)).toBe(1.5);
    expect(wheelFactor(100000)).toBeCloseTo(1 / 1.5);
    expect(wheelFactor(-3, 1)).toBeCloseTo(wheelFactor(-48, 0));
  });
});
