import { assert, describe, it } from '@effect/vitest';

import { DEFAULT_DARK_COLORS, DEFAULT_LIGHT_COLORS, DEFAULT_THEME_FONT } from './themes.ts';
import { themeFromVscode } from './vscodeTheme.ts';

/** Fake variable reader: unset names read as `''`, exactly like a missing `--vscode-*` property. */
const readerOf =
  (vars: Readonly<Record<string, string>>) =>
  (name: string): string =>
    vars[name] ?? '';

describe('themeFromVscode', () => {
  it('maps present variables onto theme colors and font', () => {
    const { colors, font } = themeFromVscode(
      readerOf({
        'button.background': '#0e639c',
        'button.foreground': '#ffffff',
        'button.hoverBackground': '#1177bb',
        descriptionForeground: '#9d9d9d',
        'editorWidget.background': '#202020',
        errorForeground: '#f48771',
        'font-family': '"Segoe UI", sans-serif',
        'font-size': '14px',
        'scrollbarSlider.background': '#79797966',
        'sideBar.background': '#252526',
        'sideBar.foreground': '#cccccc',
        'widget.border': '#454545',
      }),
      'vscode-dark',
    );

    assert.strictEqual(colors.bgDefault, '#252526');
    assert.strictEqual(colors.bgPaper, '#202020');
    assert.strictEqual(colors.divider, '#454545');
    assert.strictEqual(colors.textPrimary, '#cccccc');
    assert.strictEqual(colors.textSecondary, '#9d9d9d');
    assert.strictEqual(colors.primaryMain, '#0e639c');
    assert.strictEqual(colors.primaryContained, '#0e639c');
    assert.strictEqual(colors.primaryContainedHover, '#1177bb');
    assert.strictEqual(colors.onAccent, '#ffffff');
    assert.strictEqual(colors.errorMain, '#f48771');
    assert.strictEqual(colors.scrollbarThumb, '#79797966');
    assert.strictEqual(colors.mode, 'dark');
    assert.deepStrictEqual(font, { family: '"Segoe UI", sans-serif', sizePx: 14 });
  });

  it('maps the slash-command colors onto the command chip', () => {
    const { colors } = themeFromVscode(
      readerOf({ 'chat.slashCommandBackground': '#264f7855', 'chat.slashCommandForeground': '#85b6ff' }),
      'vscode-dark',
    );

    assert.strictEqual(colors.commandChipForeground, '#85b6ff');
    assert.strictEqual(colors.commandChipBackground, '#264f7855');
  });

  it('walks each variable chain in order', () => {
    const viaEditor = themeFromVscode(readerOf({ 'editor.background': '#111111' }), 'vscode-dark').colors;
    assert.strictEqual(viaEditor.bgDefault, '#111111');

    const viaMenu = themeFromVscode(readerOf({ 'menu.background': '#222222' }), 'vscode-dark').colors;
    assert.strictEqual(viaMenu.bgPaper, '#222222');

    const widgetWins = themeFromVscode(
      readerOf({ 'editorWidget.background': '#333333', 'menu.background': '#222222' }),
      'vscode-dark',
    ).colors;
    assert.strictEqual(widgetWins.bgPaper, '#333333');

    const viaFocus = themeFromVscode(readerOf({ focusBorder: '#007fd4' }), 'vscode-dark').colors;
    assert.strictEqual(viaFocus.primaryMain, '#007fd4');
    assert.strictEqual(viaFocus.primaryContained, '#007fd4');
  });

  it('trims values and treats blank as missing', () => {
    const { colors } = themeFromVscode(
      readerOf({ 'editorWidget.background': '   ', 'menu.background': ' #222222 ', 'sideBar.background': ' #252526' }),
      'vscode-dark',
    );

    assert.strictEqual(colors.bgDefault, '#252526');
    assert.strictEqual(colors.bgPaper, '#222222');
  });

  it('falls back to Default (Dark) for dark kinds with every field set', () => {
    for (const kind of ['vscode-dark', 'vscode-high-contrast', undefined, 'something-new']) {
      const { colors, font } = themeFromVscode(readerOf({}), kind);

      assert.strictEqual(colors.mode, 'dark');
      assert.strictEqual(colors.bgDefault, DEFAULT_DARK_COLORS.bgDefault);
      assert.strictEqual(colors.bgPaper, DEFAULT_DARK_COLORS.bgPaper);
      assert.strictEqual(colors.textPrimary, DEFAULT_DARK_COLORS.textPrimary);
      assert.strictEqual(colors.primaryMain, DEFAULT_DARK_COLORS.primaryMain);
      assert.deepStrictEqual(font, DEFAULT_THEME_FONT);
      for (const [key, value] of Object.entries(colors)) {
        assert.isTrue(value.length > 0, `${kind}: ${key} is empty`);
      }
    }
  });

  it('falls back to Default (Light) for light kinds with every field set', () => {
    for (const kind of ['vscode-light', 'vscode-high-contrast-light']) {
      const { colors } = themeFromVscode(readerOf({}), kind);

      assert.strictEqual(colors.mode, 'light');
      assert.strictEqual(colors.bgDefault, DEFAULT_LIGHT_COLORS.bgDefault);
      assert.strictEqual(colors.bgPaper, DEFAULT_LIGHT_COLORS.bgPaper);
      assert.strictEqual(colors.textPrimary, DEFAULT_LIGHT_COLORS.textPrimary);
      assert.strictEqual(colors.primaryMain, DEFAULT_LIGHT_COLORS.primaryMain);
      for (const [key, value] of Object.entries(colors)) {
        assert.isTrue(value.length > 0, `${kind}: ${key} is empty`);
      }
    }
  });

  it('tints the fallback user bubble lighter for light kinds', () => {
    const vars = { descriptionForeground: '#808080' };
    const dark = themeFromVscode(readerOf(vars), 'vscode-dark').colors.userMessageBackground;
    const light = themeFromVscode(readerOf(vars), 'vscode-light').colors.userMessageBackground;

    assert.strictEqual(dark, 'rgba(128, 128, 128, 0.32)');
    assert.strictEqual(light, 'rgba(128, 128, 128, 0.18)');
  });

  it('ignores an unusable font size', () => {
    for (const size of ['', 'large', '0px', '-3px']) {
      const { font } = themeFromVscode(readerOf({ 'font-size': size }), 'vscode-dark');
      assert.strictEqual(font.sizePx, DEFAULT_THEME_FONT.sizePx);
    }
  });
});
