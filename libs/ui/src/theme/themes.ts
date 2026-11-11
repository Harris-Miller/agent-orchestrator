import { createElement } from 'react';
import Fade from '@mui/material/Fade';
import { alpha, createTheme, darken } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

import { CheckGlyph, RadioGlyph } from './ControlGlyphs.tsx';
import type { ThemeId } from './themeId.ts';
import { FONT_FAMILY_UI, PANEL_HEADER_HEIGHT, RADIUS } from './tokens.ts';

declare module '@mui/material/styles' {
  interface Palette {
    /** Unset under a plain MUI theme (tests); chips then fall back to secondary. */
    commandChip?: { readonly background: string; readonly foreground: string };
    composerBackground?: string;
    userMessageBackground?: string;
  }
  interface PaletteOptions {
    commandChip?: { readonly background: string; readonly foreground: string };
    composerBackground?: string;
    userMessageBackground?: string;
  }
}

export type ThemeColors = {
  readonly alertInfoBg: string;
  readonly alertWarningBg: string;
  readonly bgDefault: string;
  readonly bgPaper: string;
  /** Command chip (`/` and `$`) fill and text; derived from secondary when unset. */
  readonly commandChipBackground?: string;
  readonly commandChipForeground?: string;
  /** Composer field fill; `bgPaper` when unset. */
  readonly composerBackground?: string;
  /** User message bubble fill; a secondary tint when unset. */
  readonly userMessageBackground?: string;
  readonly divider: string;
  readonly errorDark: string;
  readonly errorLight: string;
  readonly errorMain: string;
  readonly infoDark: string;
  readonly infoLight: string;
  readonly infoMain: string;
  readonly mode: 'dark' | 'light';
  readonly onAccent: string;
  readonly primaryContained: string;
  readonly primaryContainedHover: string;
  readonly primaryDark: string;
  readonly primaryLight: string;
  readonly primaryMain: string;
  readonly scrollbarThumb: string;
  readonly scrollbarTrack: string;
  readonly secondaryContained: string;
  readonly secondaryContainedHover: string;
  readonly secondaryDark: string;
  readonly secondaryLight: string;
  readonly secondaryMain: string;
  readonly successDark: string;
  readonly successLight: string;
  readonly successMain: string;
  readonly switchTrackOff: string;
  readonly textMuted: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly warningDark: string;
  readonly warningLight: string;
  readonly warningMain: string;
};

type CatppuccinFlavor = {
  readonly base: string;
  readonly blue: string;
  readonly crust: string;
  readonly dark: boolean;
  readonly green: string;
  readonly lavender: string;
  readonly mantle: string;
  readonly mauve: string;
  readonly overlay0: string;
  readonly overlay1: string;
  readonly peach: string;
  readonly pink: string;
  readonly red: string;
  readonly sapphire: string;
  readonly sky: string;
  readonly subtext0: string;
  readonly surface0: string;
  readonly surface1: string;
  readonly text: string;
  readonly yellow: string;
};

/** UI font a theme sets on MUI typography. */
export type ThemeFont = {
  readonly family: string;
  readonly sizePx: number;
};

/** Body size the typography variants are authored against; other sizes scale them. */
const BASE_FONT_SIZE_PX = 13;

export const DEFAULT_THEME_FONT: ThemeFont = { family: FONT_FAMILY_UI, sizePx: BASE_FONT_SIZE_PX };

export const createAppTheme = (c: ThemeColors, font: ThemeFont = DEFAULT_THEME_FONT): Theme => {
  const px = (size: number) => Math.round(size * (font.sizePx / BASE_FONT_SIZE_PX) * 100) / 100;
  const shadows = Array.from({ length: 25 }, (_, i) => {
    if (i === 0) return 'none';
    if (i <= 2) return c.mode === 'dark' ? '0 1px 2px rgb(0 0 0 / 0.3)' : '0 1px 2px rgb(0 0 0 / 0.05)';
    if (i <= 12) {
      return c.mode === 'dark'
        ? '0 16px 40px -18px rgb(0 0 0 / 0.8)'
        : '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
    }
    return c.mode === 'dark'
      ? '0 20px 60px rgb(0 0 0 / 0.5)'
      : '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';
  }) as Theme['shadows'];
  const selected = alpha(c.textPrimary, 0.08);
  return createTheme({
    focusVisible: {
      outlineColor: 'transparent',
      outlineOffset: 0,
      boxShadow: `0 0 0 3px ${alpha(c.primaryMain, 0.5)}`,
    },
    motion: { reducedMotion: 'system' as const },
    transitions: {
      duration: {
        complex: 250,
        enteringScreen: 150,
        leavingScreen: 100,
        short: 150,
        shorter: 150,
        shortest: 100,
        standard: 200,
      },
    },
    breakpoints: { values: { xs: 400, sm: 600, md: 900, lg: 1200, xl: 1536 } },
    components: {
      MuiAccordion: {
        defaultProps: {
          disableGutters: true,
          elevation: 0,
          square: true,
        },
        styleOverrides: {
          root: {
            '&::before': { display: 'none' },
            backgroundColor: 'transparent',
            borderBottom: `1px solid ${c.divider}`,
          },
        },
      },
      MuiAccordionDetails: {
        styleOverrides: {
          root: { padding: '4px 8px 8px' },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          content: { alignItems: 'center', gap: 8, margin: '4px 0' },
          root: { minHeight: 32, paddingLeft: 8, paddingRight: 8 },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontSize: 13,
            lineHeight: 1.45,
            padding: '4px 10px',
            variants: [
              {
                props: { severity: 'info', variant: 'standard' },
                style: {
                  backgroundColor: c.alertInfoBg,
                  color: c.infoMain,
                },
              },
              {
                props: { severity: 'success', variant: 'standard' },
                style: {
                  backgroundColor: alpha(c.successMain, 0.14),
                  color: c.successLight,
                },
              },
              {
                props: { severity: 'warning', variant: 'standard' },
                style: {
                  backgroundColor: c.alertWarningBg,
                  color: c.warningLight,
                },
              },
              {
                props: { severity: 'error', variant: 'standard' },
                style: {
                  backgroundColor: alpha(c.errorMain, 0.14),
                  color: c.errorLight,
                },
              },
              ...(
                [
                  { main: c.infoMain, outlined: c.infoMain, severity: 'info' as const },
                  { main: c.successMain, outlined: c.successLight, severity: 'success' as const },
                  { main: c.warningMain, outlined: c.warningLight, severity: 'warning' as const },
                  { main: c.errorMain, outlined: c.errorLight, severity: 'error' as const },
                ] as const
              ).flatMap(({ main, outlined, severity }) => [
                {
                  props: { severity, variant: 'filled' as const },
                  style: { backgroundColor: main, color: c.onAccent },
                },
                {
                  props: { severity, variant: 'outlined' as const },
                  style: {
                    backgroundColor: 'transparent',
                    border: `1px solid ${main}`,
                    color: outlined,
                  },
                },
              ]),
            ],
          },
        },
      },
      MuiAppBar: {
        defaultProps: {
          color: 'default',
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundColor: c.bgPaper,
            backgroundImage: 'none',
            borderBottom: `1px solid ${c.divider}`,
            boxShadow: 'none',
            boxSizing: 'border-box',
            color: c.textPrimary,
            minHeight: PANEL_HEADER_HEIGHT,
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          inputRoot: {
            padding: '0 28px 0 8px',
          },
          option: {
            '&[aria-selected="true"]': {
              backgroundColor: selected,
            },
            fontSize: 13,
            minHeight: 32,
          },
          paper: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: RADIUS.lg,
            boxShadow: shadows[8],
          },
        },
      },
      MuiButtonBase: { defaultProps: { disableRipple: true } },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            '&.MuiButton-sizeLarge': {
              borderRadius: RADIUS.md,
              fontSize: 13,
              minHeight: 32,
              padding: '0 12px',
            },
            '&.MuiButton-sizeSmall': {
              borderRadius: RADIUS.md,
              fontSize: 12,
              minHeight: 24,
              padding: '0 8px',
            },
            borderRadius: RADIUS.md,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: 0,
            lineHeight: 1.45,
            minHeight: 28,
            minWidth: 0,
            padding: '0 10px',
            textTransform: 'none',
            variants: [
              {
                props: { color: 'primary', variant: 'contained' },
                style: {
                  '&:hover': {
                    backgroundColor: c.primaryContainedHover,
                  },
                  backgroundColor: c.primaryContained,
                  color: c.onAccent,
                },
              },
              {
                props: { color: 'secondary', variant: 'contained' },
                style: {
                  '&:hover': {
                    backgroundColor: c.secondaryContainedHover,
                  },
                  backgroundColor: c.secondaryContained,
                  color: c.onAccent,
                },
              },
              {
                props: { color: 'primary', variant: 'text' },
                style: {
                  '&:hover': {
                    backgroundColor: alpha(c.textPrimary, 0.06),
                  },
                  backgroundColor: 'transparent',
                  color: c.textPrimary,
                },
              },
              {
                props: { variant: 'outlined' },
                style: {
                  '&:hover': {
                    backgroundColor: alpha(c.textPrimary, 0.06),
                    borderColor: c.divider,
                  },
                  borderColor: c.divider,
                },
              },
            ],
          },
        },
      },
      // Beat MuiButton borderRadius so split/grouped buttons join flush.
      MuiButtonGroup: {
        styleOverrides: {
          grouped: {
            borderRadius: 0,
          },
          root: {
            borderRadius: 4,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: c.bgPaper,
            backgroundImage: 'none',
            border: `1px solid ${c.divider}`,
            borderRadius: RADIUS.lg,
            boxShadow: 'none',
          },
        },
      },
      MuiCheckbox: {
        defaultProps: {
          icon: createElement(CheckGlyph),
          checkedIcon: createElement(CheckGlyph, { checked: true }),
          indeterminateIcon: createElement(CheckGlyph, { mixed: true }),
        },
        styleOverrides: {
          root: { padding: 4 },
        },
      },
      MuiChip: {
        styleOverrides: {
          label: {
            paddingLeft: 6,
            paddingRight: 6,
          },
          root: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: 4,
            color: c.textPrimary,
            fontSize: 12,
            fontWeight: 400,
            height: 22,
            variants: [
              {
                props: { size: 'small' },
                style: {
                  fontSize: 11,
                  height: 20,
                },
              },
              ...(
                [
                  { color: 'primary' as const, fill: c.primaryContained },
                  { color: 'success' as const, fill: c.successMain },
                  { color: 'warning' as const, fill: c.warningMain },
                  { color: 'error' as const, fill: c.errorMain },
                ] as const
              ).map(({ color, fill }) => ({
                props: { color, variant: 'filled' as const },
                style: {
                  backgroundColor: fill,
                  borderColor: fill,
                  color: c.onAccent,
                },
              })),
              ...(
                [
                  { border: c.successMain, color: 'success' as const, text: c.successLight },
                  { border: c.warningMain, color: 'warning' as const, text: c.warningLight },
                  { border: c.errorMain, color: 'error' as const, text: c.errorLight },
                ] as const
              ).map(({ border, color, text }) => ({
                props: { color, variant: 'outlined' as const },
                style: { borderColor: border, color: text },
              })),
            ],
          },
        },
      },
      MuiCircularProgress: {
        defaultProps: {
          size: 20,
          thickness: 4,
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          '::selection': {
            backgroundColor: alpha(c.primaryMain, 0.28),
          },
          '*': {
            scrollbarColor: `${c.scrollbarThumb} ${c.scrollbarTrack}`,
            scrollbarWidth: 'thin',
          },
          body: {
            backgroundColor: c.bgDefault,
            color: c.textPrimary,
            fontSize: 13,
          },
          'html, body, #root': {
            minHeight: '100%',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: RADIUS.xl,
            boxShadow: shadows[24],
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: { padding: '8px 12px' },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: { padding: '8px 12px' },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: { fontSize: 14, fontWeight: 600, padding: '10px 12px' },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: c.divider,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: c.bgPaper,
            backgroundImage: 'none',
            borderRight: 0,
            color: c.textPrimary,
            paddingTop: 8,
          },
        },
      },
      MuiFormControlLabel: {
        styleOverrides: {
          // Switch/Checkbox padding is 0 in this theme — restore label gap (matches Stack spacing={1}).
          root: { columnGap: 8, marginLeft: 0, marginRight: 8 },
        },
      },
      MuiFormHelperText: {
        styleOverrides: {
          root: { fontSize: 11, marginLeft: 0, marginTop: 4 },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: alpha(c.textPrimary, 0.06),
              color: c.textPrimary,
            },
            '&.MuiIconButton-sizeSmall': {
              height: 24,
              padding: 0,
              width: 24,
            },
            borderRadius: RADIUS.md,
            color: c.textMuted,
            height: 28,
            padding: 4,
            width: 28,
          },
        },
      },
      MuiInput: {
        defaultProps: {
          disableUnderline: true,
        },
      },
      MuiInputAdornment: {
        styleOverrides: {
          positionStart: {
            marginLeft: 0,
            marginRight: 4,
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          adornedStart: {
            paddingLeft: 6,
          },
          input: {
            '&::placeholder': {
              color: c.textMuted,
              opacity: 1,
            },
            boxSizing: 'border-box',
            height: 20,
            padding: '4px 8px',
          },
          root: {
            '&:hover': {
              borderColor: alpha(c.textPrimary, 0.2),
            },
            '&.Mui-disabled': {
              backgroundColor: alpha(c.textMuted, 0.12),
              color: c.textMuted,
            },
            '&.Mui-focused': {
              borderColor: c.primaryMain,
              boxShadow: `0 0 0 3px ${alpha(c.primaryMain, 0.5)}`,
            },
            '&.MuiInputBase-sizeSmall': {
              minHeight: 24,
            },
            backgroundColor: 'transparent',
            border: `1px solid ${c.divider}`,
            borderRadius: RADIUS.md,
            color: c.textPrimary,
            fontSize: 13,
            minHeight: 28,
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 2, height: 4 },
        },
      },
      MuiLink: {
        defaultProps: {
          underline: 'hover',
        },
        styleOverrides: {
          root: {
            color: c.primaryMain,
            textDecorationColor: alpha(c.primaryMain, 0.44),
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: alpha(c.textPrimary, 0.05),
            },
            '&.Mui-selected': {
              '&:hover': {
                backgroundColor: alpha(c.textPrimary, 0.1),
              },
              backgroundColor: selected,
              color: c.textPrimary,
            },
            borderRadius: RADIUS.md,
            minHeight: 32,
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: { minWidth: 28 },
        },
      },
      MuiMenu: {
        defaultProps: { slots: { transition: Fade }, transitionDuration: { enter: 150, exit: 100 } },
        styleOverrides: {
          list: { padding: 4 },
          paper: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: RADIUS.lg,
            boxShadow: shadows[8],
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: 13,
            minHeight: 28,
            borderRadius: RADIUS.sm,
            paddingLeft: 8,
            paddingRight: 8,
            '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: selected },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          input: {
            boxSizing: 'border-box',
            height: 20,
            padding: '4px 8px',
          },
          notchedOutline: {
            border: 0,
          },
          root: {
            '& .MuiOutlinedInput-inputAdornedStart': {
              paddingLeft: 0,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          outlined: {
            borderColor: c.divider,
          },
          root: {
            backgroundColor: c.bgPaper,
            backgroundImage: 'none',
          },
          rounded: {
            borderRadius: RADIUS.lg,
          },
        },
      },
      MuiPopover: {
        defaultProps: { slots: { transition: Fade }, transitionDuration: { enter: 150, exit: 100 } },
        styleOverrides: {
          paper: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: RADIUS.lg,
            boxShadow: shadows[8],
          },
        },
      },
      MuiRadio: {
        defaultProps: {
          icon: createElement(RadioGlyph),
          checkedIcon: createElement(RadioGlyph, { checked: true }),
        },
        styleOverrides: { root: { padding: 4 } },
      },
      MuiSelect: {
        styleOverrides: {
          icon: {
            color: c.textMuted,
          },
          select: {
            alignItems: 'center',
            display: 'flex',
            minHeight: 20,
            padding: '0 28px 0 8px',
          },
        },
      },
      MuiSkeleton: {
        styleOverrides: {
          root: { borderRadius: 4 },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: RADIUS.lg,
            boxShadow: shadows[6],
            color: c.textPrimary,
            fontSize: 13,
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: {
            height: 20,
            padding: 0,
            width: 34,
          },
          switchBase: {
            '&.Mui-checked': {
              '& + .MuiSwitch-track': {
                backgroundColor: c.primaryMain,
                opacity: 1,
              },
              color: c.onAccent,
              transform: 'translateX(14px)',
            },
            color: c.textPrimary,
            padding: 2,
            top: 0,
          },
          thumb: {
            boxShadow: 'none',
            height: 16,
            width: 16,
          },
          track: {
            backgroundColor: c.switchTrackOff,
            borderRadius: 10,
            boxSizing: 'border-box',
            height: 20,
            opacity: 1,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            '&.Mui-selected': {
              color: c.primaryMain,
            },
            color: c.textSecondary,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 0,
            lineHeight: 1.15,
            minHeight: 32,
            minWidth: 0,
            padding: '0 10px',
            textTransform: 'none',
          },
        },
      },
      MuiTable: {
        defaultProps: {
          size: 'small',
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            color: c.textSecondary,
            fontWeight: 600,
          },
          root: {
            borderBottom: `1px solid ${c.divider}`,
            color: c.textPrimary,
            fontSize: 13,
            fontWeight: 400,
            lineHeight: 1.45,
            padding: '6px 10px',
          },
          stickyHeader: {
            backgroundColor: c.bgPaper,
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: RADIUS.lg,
            boxShadow: 'none',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:last-child > td': {
              borderBottom: 0,
            },
            '&.MuiTableRow-hover:hover': {
              backgroundColor: selected,
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            backgroundColor: c.primaryMain,
            height: 2,
          },
          root: {
            borderBottom: `1px solid ${c.divider}`,
            minHeight: 32,
          },
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: {
            // Override MUI default sm+ minHeight: 64 so chrome matches PANEL_HEADER_HEIGHT.
            '@media (min-width:600px)': {
              minHeight: PANEL_HEADER_HEIGHT,
            },
            minHeight: PANEL_HEADER_HEIGHT,
            paddingLeft: 12,
            paddingRight: 12,
          },
        },
      },
      MuiTooltip: {
        defaultProps: { slots: { transition: Fade }, enterDelay: 100 },
        styleOverrides: {
          arrow: {
            color: c.bgPaper,
          },
          tooltip: {
            backgroundColor: alpha(c.bgPaper, 0.98),
            border: `1px solid ${c.divider}`,
            borderRadius: RADIUS.md,
            boxShadow: shadows[2],
            padding: '6px 10px',
            color: c.textPrimary,
            fontSize: 12,
          },
        },
      },
    },
    palette: {
      composerBackground: c.composerBackground ?? c.bgPaper,
      userMessageBackground: c.userMessageBackground ?? alpha(c.secondaryMain, c.mode === 'dark' ? 0.32 : 0.18),
      commandChip: {
        background: c.commandChipBackground ?? alpha(c.secondaryMain, 0.08),
        foreground: c.commandChipForeground ?? c.secondaryMain,
      },
      action: {
        active: c.textPrimary,
        disabled: c.textMuted,
        disabledBackground: alpha(c.textMuted, 0.12),
        focus: selected,
        hover: alpha(c.textPrimary, 0.05),
        selected,
      },
      background: {
        default: c.bgDefault,
        paper: c.bgPaper,
      },
      divider: c.divider,
      error: {
        contrastText: c.onAccent,
        dark: c.errorDark,
        light: c.errorLight,
        main: c.errorMain,
      },
      info: {
        contrastText: c.onAccent,
        dark: c.infoDark,
        light: c.infoLight,
        main: c.infoMain,
      },
      mode: c.mode,
      primary: {
        contrastText: c.onAccent,
        dark: c.primaryDark,
        light: c.primaryLight,
        main: c.primaryMain,
      },
      secondary: {
        contrastText: c.onAccent,
        dark: c.secondaryDark,
        light: c.secondaryLight,
        main: c.secondaryMain,
      },
      success: {
        contrastText: c.onAccent,
        dark: c.successDark,
        light: c.successLight,
        main: c.successMain,
      },
      text: {
        disabled: c.textMuted,
        primary: c.textPrimary,
        secondary: c.textSecondary,
      },
      warning: {
        contrastText: c.onAccent,
        dark: c.warningDark,
        light: c.warningLight,
        main: c.warningMain,
      },
    },
    shadows,
    shape: {
      borderRadius: 4,
    },
    typography: {
      body1: {
        fontSize: px(13),
        fontWeight: 400,
        lineHeight: 1.45,
      },
      body2: {
        fontSize: px(12),
        fontWeight: 400,
        lineHeight: 1.45,
      },
      button: {
        fontSize: px(13),
        fontWeight: 500,
        letterSpacing: 0,
        lineHeight: 1.45,
        textTransform: 'none',
      },
      caption: {
        fontSize: px(11),
        fontWeight: 400,
        lineHeight: 1.35,
      },
      fontFamily: font.family,
      fontSize: font.sizePx,
      fontWeightMedium: 500,
      h1: {
        fontSize: px(22),
        fontWeight: 600,
        lineHeight: 1.25,
      },
      h2: {
        fontSize: px(18),
        fontWeight: 600,
        lineHeight: 1.3,
      },
      h3: {
        fontSize: px(15),
        fontWeight: 600,
        lineHeight: 1.35,
      },
      h4: {
        fontSize: px(13),
        fontWeight: 600,
        lineHeight: 1.45,
      },
      h5: {
        fontSize: px(12),
        fontWeight: 600,
        lineHeight: 1.4,
      },
      h6: {
        fontSize: px(12),
        fontWeight: 600,
        lineHeight: 1.4,
      },
      overline: {
        fontSize: px(10),
        fontWeight: 700,
        letterSpacing: '0.04em',
        lineHeight: 1.5,
        textTransform: 'uppercase',
      },
      subtitle1: {
        fontSize: px(14),
        fontWeight: 400,
        lineHeight: 1.4,
      },
      subtitle2: {
        fontSize: px(13),
        fontWeight: 600,
        lineHeight: 1.45,
      },
    },
  });
};

export const ORIGINAL_COLORS: ThemeColors = {
  alertInfoBg: '#1a2a43',
  alertWarningBg: '#3e2724',
  bgDefault: '#13171b',
  bgPaper: '#1d2027',
  // Soft hairline (Cursor-like); panel seams come from Allotment, not doubled pane borders
  divider: 'rgba(255, 255, 255, 0.09)',
  errorDark: '#962533',
  errorLight: '#ff6b6b',
  errorMain: '#d7354a',
  infoDark: '#1a5fa8',
  infoLight: '#71beff',
  infoMain: '#4c97ff',
  mode: 'dark',
  onAccent: '#ffffff',
  primaryContained: '#1061ad',
  primaryContainedHover: '#3178c6',
  primaryDark: '#1061ad',
  primaryLight: '#71beff',
  primaryMain: '#60a7ff',
  scrollbarThumb: '#454b58',
  scrollbarTrack: '#13171b',
  secondaryContained: '#9d62c4',
  secondaryContainedHover: '#b476dc',
  secondaryDark: '#9d62c4',
  secondaryLight: '#e1adff',
  secondaryMain: '#d48fff',
  successDark: '#00664d',
  successLight: '#43bf9f',
  successMain: '#008765',
  switchTrackOff: '#575d6b',
  textMuted: '#a0a7b5',
  textPrimary: '#f3f7ff',
  textSecondary: 'rgba(214, 223, 242, 0.70)',
  warningDark: '#9f351c',
  warningLight: '#ff8a66',
  warningMain: '#e15428',
};

/** Catppuccin palette → app tokens. Style guide: mantle pane, base paper, lifted composer, mauve primary, blue secondary. */
const fromCatppuccin = (f: CatppuccinFlavor): ThemeColors => {
  const onAccent = f.base;
  return {
    alertInfoBg: alpha(f.sky, 0.14),
    alertWarningBg: alpha(f.peach, 0.14),
    bgDefault: f.mantle,
    bgPaper: f.base,
    composerBackground: f.dark ? f.surface0 : f.base,
    divider: f.dark ? alpha('#ffffff', 0.09) : alpha(f.overlay0, 0.35),
    errorDark: darken(f.red, 0.2),
    errorLight: f.red,
    errorMain: f.red,
    infoDark: darken(f.sky, 0.2),
    infoLight: f.sapphire,
    infoMain: f.sky,
    mode: f.dark ? 'dark' : 'light',
    onAccent,
    primaryContained: f.mauve,
    primaryContainedHover: darken(f.mauve, 0.1),
    primaryDark: darken(f.mauve, 0.15),
    primaryLight: f.pink,
    primaryMain: f.mauve,
    scrollbarThumb: f.surface1,
    scrollbarTrack: f.crust,
    secondaryContained: f.blue,
    secondaryContainedHover: darken(f.blue, 0.1),
    secondaryDark: darken(f.blue, 0.15),
    secondaryLight: f.lavender,
    secondaryMain: f.blue,
    userMessageBackground: alpha(f.surface0, f.dark ? 0.6 : 0.5),
    successDark: darken(f.green, 0.2),
    successLight: f.green,
    successMain: f.green,
    switchTrackOff: f.surface1,
    textMuted: f.overlay1,
    textPrimary: f.text,
    textSecondary: f.subtext0,
    warningDark: darken(f.yellow, 0.2),
    warningLight: f.peach,
    warningMain: f.yellow,
  };
};

// Hex from https://github.com/catppuccin/palette/blob/main/palette.json
const CATPPUCCIN = {
  frappe: {
    base: '#303446',
    blue: '#8caaee',
    crust: '#232634',
    dark: true,
    green: '#a6d189',
    lavender: '#babbf1',
    mantle: '#292c3c',
    mauve: '#ca9ee6',
    overlay0: '#737994',
    overlay1: '#838ba7',
    peach: '#ef9f76',
    pink: '#f4b8e4',
    red: '#e78284',
    sapphire: '#85c1dc',
    sky: '#99d1db',
    subtext0: '#a5adce',
    surface0: '#414559',
    surface1: '#51576d',
    text: '#c6d0f5',
    yellow: '#e5c890',
  },
  latte: {
    base: '#eff1f5',
    blue: '#1e66f5',
    crust: '#dce0e8',
    dark: false,
    green: '#40a02b',
    lavender: '#7287fd',
    mantle: '#e6e9ef',
    mauve: '#8839ef',
    overlay0: '#9ca0b0',
    overlay1: '#8c8fa1',
    peach: '#fe640b',
    pink: '#ea76cb',
    red: '#d20f39',
    sapphire: '#209fb5',
    sky: '#04a5e5',
    subtext0: '#6c6f85',
    surface0: '#ccd0da',
    surface1: '#bcc0cc',
    text: '#4c4f69',
    yellow: '#df8e1d',
  },
  macchiato: {
    base: '#24273a',
    blue: '#8aadf4',
    crust: '#181926',
    dark: true,
    green: '#a6da95',
    lavender: '#b7bdf8',
    mantle: '#1e2030',
    mauve: '#c6a0f6',
    overlay0: '#6e738d',
    overlay1: '#8087a2',
    peach: '#f5a97f',
    pink: '#f5bde6',
    red: '#ed8796',
    sapphire: '#7dc4e4',
    sky: '#91d7e3',
    subtext0: '#a5adcb',
    surface0: '#363a4f',
    surface1: '#494d64',
    text: '#cad3f5',
    yellow: '#eed49f',
  },
  mocha: {
    base: '#1e1e2e',
    blue: '#89b4fa',
    crust: '#11111b',
    dark: true,
    green: '#a6e3a1',
    lavender: '#b4befe',
    mantle: '#181825',
    mauve: '#cba6f7',
    overlay0: '#6c7086',
    overlay1: '#7f849c',
    peach: '#fab387',
    pink: '#f5c2e7',
    red: '#f38ba8',
    sapphire: '#74c7ec',
    sky: '#89dceb',
    subtext0: '#a6adc8',
    surface0: '#313244',
    surface1: '#45475a',
    text: '#cdd6f4',
    yellow: '#f9e2af',
  },
} as const satisfies Record<Exclude<ThemeId, 'original'>, CatppuccinFlavor>;

export const LATTE_COLORS: ThemeColors = fromCatppuccin(CATPPUCCIN.latte);

export const themes: Record<ThemeId, Theme> = {
  frappe: createAppTheme(fromCatppuccin(CATPPUCCIN.frappe)),
  latte: createAppTheme(LATTE_COLORS),
  macchiato: createAppTheme(fromCatppuccin(CATPPUCCIN.macchiato)),
  mocha: createAppTheme(fromCatppuccin(CATPPUCCIN.mocha)),
  original: createAppTheme(ORIGINAL_COLORS),
};

/** Default / Original theme — prefer `themes[themeId]` when selecting. */
export const theme = themes.original;
