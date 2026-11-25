import { assert, describe, it } from '@effect/vitest';

import { parsePaintThemeRaw } from './themePaintCache.ts';
import { resolvePaintedSlot, resolvePaintedThemeId, resolveThemeSettings } from './themeSettings.ts';
import { DARK_THEME_IDS, LIGHT_THEME_IDS, THEME_COLORS, THEME_IDS } from './themes.ts';

const defaults = { darkTheme: 'default-dark', lightTheme: 'default-light', paintedSlot: 'system' };

describe('resolveThemeSettings', () => {
  it('defaults when nothing is set or unknown', () => {
    assert.deepStrictEqual(resolveThemeSettings({}), defaults);
    assert.deepStrictEqual(resolveThemeSettings({ theme: 'nope' }), defaults);
  });

  it('maps legacy dark themes to the dark slot, always dark', () => {
    for (const [theme, darkTheme] of [
      ['original', 'default-dark'],
      ['default-dark', 'default-dark'],
      ['frappe', 'frappe'],
      ['macchiato', 'macchiato'],
      ['mocha', 'mocha'],
    ]) {
      assert.deepStrictEqual(resolveThemeSettings({ theme }), { ...defaults, darkTheme, paintedSlot: 'dark' });
    }
  });

  it('maps legacy latte to the light slot, always light', () => {
    assert.deepStrictEqual(resolveThemeSettings({ theme: 'latte' }), {
      ...defaults,
      lightTheme: 'latte',
      paintedSlot: 'light',
    });
  });

  it('lets the new fields win over the legacy theme', () => {
    assert.deepStrictEqual(
      resolveThemeSettings({ darkTheme: 'nord', lightTheme: 'one-light', paintedSlot: 'light', theme: 'mocha' }),
      { darkTheme: 'nord', lightTheme: 'one-light', paintedSlot: 'light' },
    );
  });

  it('falls back to the slot default for a wrong-mode or unknown id', () => {
    assert.deepStrictEqual(
      resolveThemeSettings({ darkTheme: 'latte', lightTheme: 'mocha', paintedSlot: 'x' }),
      defaults,
    );
  });
});

describe('resolvePaintedSlot', () => {
  it('follows light and dark settings regardless of the OS', () => {
    for (const osPrefersDark of [true, false]) {
      assert.strictEqual(resolvePaintedSlot({ hostMode: undefined, osPrefersDark, paintedSlot: 'light' }), 'light');
      assert.strictEqual(resolvePaintedSlot({ hostMode: undefined, osPrefersDark, paintedSlot: 'dark' }), 'dark');
    }
  });

  it('follows the OS for system', () => {
    assert.strictEqual(resolvePaintedSlot({ hostMode: undefined, osPrefersDark: true, paintedSlot: 'system' }), 'dark');
    assert.strictEqual(
      resolvePaintedSlot({ hostMode: undefined, osPrefersDark: false, paintedSlot: 'system' }),
      'light',
    );
  });

  it('always follows the Host mode when the Host supplies one', () => {
    for (const paintedSlot of ['light', 'dark', 'system'] as const) {
      assert.strictEqual(resolvePaintedSlot({ hostMode: 'light', osPrefersDark: true, paintedSlot }), 'light');
      assert.strictEqual(resolvePaintedSlot({ hostMode: 'dark', osPrefersDark: false, paintedSlot }), 'dark');
    }
  });

  it('picks the slot palette', () => {
    const settings = resolveThemeSettings({ darkTheme: 'dracula', lightTheme: 'github-light' });
    assert.strictEqual(resolvePaintedThemeId({ hostMode: undefined, osPrefersDark: true, settings }), 'dracula');
    assert.strictEqual(resolvePaintedThemeId({ hostMode: undefined, osPrefersDark: false, settings }), 'github-light');
  });
});

describe('paint cache', () => {
  it('round-trips the JSON triple', () => {
    const settings = resolveThemeSettings({ darkTheme: 'nord', lightTheme: 'one-light', paintedSlot: 'dark' });
    assert.deepStrictEqual(parsePaintThemeRaw(JSON.stringify(settings)), settings);
  });

  it('maps a legacy raw string and handles missing or garbage', () => {
    assert.deepStrictEqual(parsePaintThemeRaw('latte'), { ...defaults, lightTheme: 'latte', paintedSlot: 'light' });
    assert.deepStrictEqual(parsePaintThemeRaw('original'), { ...defaults, paintedSlot: 'dark' });
    assert.deepStrictEqual(parsePaintThemeRaw(null), defaults);
    assert.deepStrictEqual(parsePaintThemeRaw('{bad'), defaults);
  });
});

const channel = (hex: string, i: number) => {
  const v = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('palette registry', () => {
  it('lists every palette in the slot that matches its mode', () => {
    assert.strictEqual(LIGHT_THEME_IDS.length + DARK_THEME_IDS.length, THEME_IDS.length);
    for (const id of LIGHT_THEME_IDS) assert.strictEqual(THEME_COLORS[id].mode, 'light', id);
    for (const id of DARK_THEME_IDS) assert.strictEqual(THEME_COLORS[id].mode, 'dark', id);
  });

  it('has readable primary text on paper for every palette', () => {
    for (const [id, colors] of Object.entries(THEME_COLORS)) {
      assert.isTrue(contrast(colors.textPrimary, colors.bgPaper) >= 4.5, id);
    }
  });
});
