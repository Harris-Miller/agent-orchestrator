import { alpha, darken, lighten } from '@mui/material/styles';

import { DEFAULT_THEME_FONT, LATTE_COLORS, ORIGINAL_COLORS } from './themes.ts';
import type { ThemeColors, ThemeFont } from './themes.ts';

/** Colors and font a Host reads from its own theme and hands to the shared UI (VS Code only today). */
export type HostTheme = {
  readonly colors: ThemeColors;
  readonly font: ThemeFont;
};

/**
 * Reads one VS Code variable by its color id (`button.background`) or its font name (`font-family`), without the
 * `--vscode-` prefix. Returns `''` when the active theme leaves it unset.
 */
export type VscodeVarReader = (name: string) => string;

/** CSS custom property VS Code writes for a color id or font name. */
export const vscodeVarName = (name: string): string => `--vscode-${name.replaceAll('.', '-')}`;

/** `data-vscode-theme-kind` values that are light; every other kind is dark. */
const isLightKind = (kind: string | undefined): boolean =>
  kind === 'vscode-light' || kind === 'vscode-high-contrast-light';

/**
 * Builds the Host theme from the active VS Code theme's variables. Each color tries a short chain of variables and
 * otherwise falls back to the preset that matches the theme kind (Original for dark, Latte for light), so no empty
 * value reaches `createAppTheme`.
 */
export const themeFromVscode = (read: VscodeVarReader, kind: string | undefined): HostTheme => {
  const preset = isLightKind(kind) ? LATTE_COLORS : ORIGINAL_COLORS;
  const pick = (fallback: string, ...names: readonly string[]): string => {
    for (const name of names) {
      const value = read(name).trim();
      if (value !== '') {
        return value;
      }
    }
    return fallback;
  };

  const bgDefault = pick(preset.bgDefault, 'sideBar.background', 'editor.background');
  const textPrimary = pick(preset.textPrimary, 'sideBar.foreground', 'foreground');
  const primaryMain = pick(preset.primaryMain, 'button.background', 'focusBorder');
  const secondaryMain = pick(preset.secondaryMain, 'descriptionForeground');
  const errorMain = pick(preset.errorMain, 'errorForeground');
  const infoMain = pick(preset.infoMain, 'editorInfo.foreground');
  const successMain = pick(preset.successMain, 'charts.green');
  const warningMain = pick(preset.warningMain, 'editorWarning.foreground');

  const sizePx = Number.parseFloat(read('font-size'));

  return {
    colors: {
      alertInfoBg: alpha(infoMain, 0.14),
      alertWarningBg: alpha(warningMain, 0.14),
      bgDefault,
      bgPaper: pick(preset.bgPaper, 'editorWidget.background', 'menu.background'),
      divider: pick(preset.divider, 'widget.border', 'panel.border'),
      errorDark: darken(errorMain, 0.2),
      errorLight: lighten(errorMain, 0.2),
      errorMain,
      infoDark: darken(infoMain, 0.2),
      infoLight: lighten(infoMain, 0.2),
      infoMain,
      mode: isLightKind(kind) ? 'light' : 'dark',
      onAccent: pick(preset.onAccent, 'button.foreground'),
      primaryContained: primaryMain,
      primaryContainedHover: pick(darken(primaryMain, 0.1), 'button.hoverBackground'),
      primaryDark: darken(primaryMain, 0.15),
      primaryLight: lighten(primaryMain, 0.2),
      primaryMain,
      scrollbarThumb: pick(preset.scrollbarThumb, 'scrollbarSlider.background'),
      scrollbarTrack: bgDefault,
      secondaryContained: pick(secondaryMain, 'button.secondaryBackground'),
      secondaryContainedHover: pick(darken(secondaryMain, 0.1), 'button.secondaryHoverBackground'),
      secondaryDark: darken(secondaryMain, 0.15),
      secondaryLight: lighten(secondaryMain, 0.2),
      secondaryMain,
      successDark: darken(successMain, 0.2),
      successLight: lighten(successMain, 0.2),
      successMain,
      switchTrackOff: pick(preset.switchTrackOff, 'input.background'),
      textMuted: pick(preset.textMuted, 'disabledForeground'),
      textPrimary,
      textSecondary: pick(preset.textSecondary, 'descriptionForeground'),
      warningDark: darken(warningMain, 0.2),
      warningLight: lighten(warningMain, 0.2),
      warningMain,
    },
    font: {
      family: pick(DEFAULT_THEME_FONT.family, 'font-family'),
      sizePx: Number.isFinite(sizePx) && sizePx > 0 ? sizePx : DEFAULT_THEME_FONT.sizePx,
    },
  };
};
