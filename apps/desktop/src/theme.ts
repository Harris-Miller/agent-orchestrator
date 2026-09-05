import { alpha, createTheme, darken } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

export const THEME_IDS = ['original', 'latte', 'frappe', 'macchiato', 'mocha'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = 'original';

export const THEME_LABELS: Record<ThemeId, string> = {
  frappe: 'Catppuccin Frappé',
  latte: 'Catppuccin Latte',
  macchiato: 'Catppuccin Macchiato',
  mocha: 'Catppuccin Mocha',
  original: 'Original',
};

type ThemeColors = {
  readonly alertInfoBg: string;
  readonly alertWarningBg: string;
  readonly bgDefault: string;
  readonly bgPaper: string;
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

const createAppTheme = (c: ThemeColors): Theme =>
  createTheme({
    components: {
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: '4px',
            fontSize: '13px',
            lineHeight: 1.54,
            padding: '2px 8px 2px 10px',
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
            ],
          },
        },
      },
      MuiAppBar: {
        defaultProps: {
          color: 'default',
          elevation: 2,
        },
        styleOverrides: {
          root: {
            backgroundColor: c.bgPaper,
            backgroundImage: 'none',
            boxShadow: '0 1px 0 rgba(0, 0, 0, 0.12)',
            color: c.textPrimary,
            minHeight: '60px',
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          inputRoot: {
            padding: '0 30px 0 8px',
          },
          option: {
            '&[aria-selected="true"]': {
              backgroundColor: alpha(c.primaryMain, 0.08),
            },
            fontSize: '13px',
            minHeight: '30px',
          },
          paper: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: '6px',
            boxShadow: '0 16px 38px rgba(0, 0, 0, 0.24)',
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            '&.MuiButton-sizeSmall': {
              fontSize: '12px',
              minHeight: '22px',
              padding: '0 8px',
            },
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 400,
            letterSpacing: 0,
            lineHeight: 1.54,
            minHeight: '30px',
            minWidth: 0,
            padding: '0 11px',
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
                    backgroundColor: alpha(c.primaryMain, 0.12),
                  },
                  backgroundColor: alpha(c.primaryMain, 0.08),
                  color: c.primaryMain,
                },
              },
              {
                props: { variant: 'outlined' },
                style: {
                  '&:hover': {
                    backgroundColor: alpha(c.primaryMain, 0.08),
                    borderColor: alpha(c.primaryMain, 0.44),
                  },
                  borderColor: c.divider,
                },
              },
            ],
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: c.bgPaper,
            backgroundImage: 'none',
            border: `1px solid ${c.divider}`,
            borderRadius: '6px',
            boxShadow: '0 1px 0 rgba(0, 0, 0, 0.04)',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          label: {
            paddingLeft: '6px',
            paddingRight: '6px',
          },
          root: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: '4px',
            color: c.textPrimary,
            fontSize: '13px',
            fontWeight: 400,
            height: '24px',
            variants: [
              {
                props: { size: 'small' },
                style: {
                  fontSize: '12px',
                  height: '18px',
                },
              },
              {
                props: { color: 'primary', variant: 'filled' },
                style: {
                  backgroundColor: c.primaryContained,
                  borderColor: c.primaryContained,
                  color: c.onAccent,
                },
              },
              {
                props: { color: 'success', variant: 'filled' },
                style: {
                  backgroundColor: c.successMain,
                  borderColor: c.successMain,
                  color: c.onAccent,
                },
              },
              {
                props: { color: 'warning', variant: 'filled' },
                style: {
                  backgroundColor: c.warningMain,
                  borderColor: c.warningMain,
                  color: c.onAccent,
                },
              },
              {
                props: { color: 'error', variant: 'filled' },
                style: {
                  backgroundColor: c.errorMain,
                  borderColor: c.errorMain,
                  color: c.onAccent,
                },
              },
              {
                props: { color: 'success', variant: 'outlined' },
                style: {
                  borderColor: c.successMain,
                  color: c.successLight,
                },
              },
              {
                props: { color: 'warning', variant: 'outlined' },
                style: {
                  borderColor: c.warningMain,
                  color: c.warningLight,
                },
              },
              {
                props: { color: 'error', variant: 'outlined' },
                style: {
                  borderColor: c.errorMain,
                  color: c.errorLight,
                },
              },
            ],
          },
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
            fontSize: '13px',
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
            borderRadius: '8px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.26)',
          },
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
            borderRight: `1px solid ${c.divider}`,
            color: c.textPrimary,
            paddingTop: '8px',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            '&:hover': {
              backgroundColor: alpha(c.primaryMain, 0.08),
              color: c.primaryMain,
            },
            '&.MuiIconButton-sizeSmall': {
              height: '22px',
              padding: 0,
              width: '22px',
            },
            borderRadius: '4px',
            color: c.textMuted,
            height: '30px',
            padding: '4px',
            width: '30px',
          },
        },
      },
      MuiInput: {
        defaultProps: {
          disableUnderline: true,
        },
      },
      MuiInputBase: {
        styleOverrides: {
          input: {
            '&::placeholder': {
              color: c.textMuted,
              opacity: 1,
            },
            boxSizing: 'border-box',
            height: '20px',
            padding: '4px 8px',
          },
          root: {
            '&:hover': {
              borderColor: alpha(c.primaryMain, 0.44),
            },
            '&.Mui-disabled': {
              backgroundColor: alpha(c.textMuted, 0.12),
              color: c.textMuted,
            },
            '&.Mui-focused': {
              borderColor: c.primaryMain,
              boxShadow: `0 0 0 1px ${alpha(c.primaryMain, 0.22)}`,
            },
            '&.MuiInputBase-sizeSmall': {
              minHeight: '22px',
            },
            backgroundColor: 'transparent',
            border: `1px solid ${c.divider}`,
            borderRadius: '4px',
            color: c.textPrimary,
            fontSize: '13px',
            minHeight: '30px',
          },
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
                backgroundColor: alpha(c.primaryMain, 0.12),
              },
              backgroundColor: alpha(c.primaryMain, 0.08),
              color: c.primaryMain,
            },
            borderRadius: '4px',
            minHeight: '40px',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          list: {
            padding: '4px',
          },
          paper: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: '6px',
            boxShadow: '0 16px 38px rgba(0, 0, 0, 0.24)',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          notchedOutline: {
            border: 0,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          rounded: {
            borderRadius: '6px',
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            boxShadow: '0 16px 38px rgba(0, 0, 0, 0.24)',
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          icon: {
            color: c.textMuted,
          },
          select: {
            alignItems: 'center',
            display: 'flex',
            minHeight: '20px',
            padding: '0 30px 0 8px',
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: c.bgPaper,
            border: `1px solid ${c.divider}`,
            borderRadius: '6px',
            boxShadow: '0 16px 38px rgba(0, 0, 0, 0.24)',
            color: c.textPrimary,
            fontSize: '13px',
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: {
            height: '20px',
            padding: 0,
            width: '34px',
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
            padding: '2px',
          },
          thumb: {
            boxShadow: 'none',
            height: '16px',
            width: '16px',
          },
          track: {
            backgroundColor: c.switchTrackOff,
            borderRadius: '10px',
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
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: 0,
            lineHeight: 1.15,
            minHeight: '44px',
            minWidth: 0,
            padding: '0 8px',
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
            fontSize: '13px',
            fontWeight: 400,
            lineHeight: 1.54,
            padding: '6px 13px',
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
            borderRadius: '6px',
            boxShadow: '0 1px 0 rgba(0, 0, 0, 0.04)',
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
              backgroundColor: alpha(c.primaryMain, 0.08),
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            backgroundColor: c.primaryMain,
            height: '2px',
          },
          root: {
            borderBottom: `1px solid ${c.divider}`,
            minHeight: '45px',
          },
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: {
            minHeight: '60px',
            paddingLeft: '16px',
            paddingRight: '16px',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          arrow: {
            color: c.bgPaper,
          },
          tooltip: {
            backgroundColor: alpha(c.bgPaper, 0.98),
            border: `1px solid ${c.divider}`,
            borderRadius: '4px',
            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.20)',
            color: c.textPrimary,
            fontSize: '12px',
          },
        },
      },
    },
    palette: {
      action: {
        active: c.textPrimary,
        disabled: c.textMuted,
        disabledBackground: alpha(c.textMuted, 0.12),
        focus: alpha(c.primaryMain, 0.12),
        hover: alpha(c.textPrimary, 0.05),
        selected: alpha(c.primaryMain, 0.08),
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
    shadows: [
      'none',
      '0 1px 0 rgba(0, 0, 0, 0.04)',
      '0 1px 0 rgba(0, 0, 0, 0.12)',
      '0 2px 6px rgba(0, 0, 0, 0.18)',
      '0 4px 12px rgba(0, 0, 0, 0.20)',
      '0 8px 20px rgba(0, 0, 0, 0.22)',
      '0 10px 24px rgba(0, 0, 0, 0.20)',
      '0 12px 28px rgba(0, 0, 0, 0.22)',
      '0 14px 32px rgba(0, 0, 0, 0.22)',
      '0 16px 38px rgba(0, 0, 0, 0.24)',
      '0 18px 42px rgba(0, 0, 0, 0.24)',
      '0 20px 48px rgba(0, 0, 0, 0.24)',
      '0 22px 52px rgba(0, 0, 0, 0.25)',
      '0 24px 56px rgba(0, 0, 0, 0.25)',
      '0 24px 60px rgba(0, 0, 0, 0.26)',
      '0 26px 64px rgba(0, 0, 0, 0.26)',
      '0 28px 68px rgba(0, 0, 0, 0.27)',
      '0 30px 72px rgba(0, 0, 0, 0.27)',
      '0 32px 76px rgba(0, 0, 0, 0.28)',
      '0 34px 80px rgba(0, 0, 0, 0.28)',
      '0 36px 84px rgba(0, 0, 0, 0.29)',
      '0 38px 88px rgba(0, 0, 0, 0.29)',
      '0 40px 92px rgba(0, 0, 0, 0.30)',
      '0 42px 96px rgba(0, 0, 0, 0.30)',
      '0 44px 100px rgba(0, 0, 0, 0.32)',
    ],
    typography: {
      body1: {
        fontSize: '13px',
        fontWeight: 400,
        lineHeight: 1.54,
      },
      body2: {
        fontSize: '12px',
        fontWeight: 400,
        lineHeight: 1.53,
      },
      button: {
        fontSize: '13px',
        fontWeight: 400,
        letterSpacing: 0,
        lineHeight: 1.54,
        textTransform: 'none',
      },
      caption: {
        fontSize: '12px',
        fontWeight: 400,
        lineHeight: 1.5,
      },
      fontFamily: 'Lato, Arial, sans-serif',
      fontSize: 13,
      fontWeightMedium: 600,
      h1: {
        fontSize: '24px',
        fontWeight: 700,
        lineHeight: '36px',
      },
      h2: {
        fontSize: '18px',
        fontWeight: 700,
        lineHeight: '27px',
      },
      h3: {
        fontSize: '15px',
        fontWeight: 700,
        lineHeight: '24px',
      },
      h4: {
        fontSize: '13px',
        fontWeight: 700,
        lineHeight: 1.53,
      },
      h5: {
        fontSize: '12px',
        fontWeight: 700,
        lineHeight: '18px',
      },
      h6: {
        fontSize: '12px',
        fontWeight: 700,
        lineHeight: '18px',
      },
      overline: {
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        lineHeight: 1.5,
        textTransform: 'uppercase',
      },
      subtitle1: {
        fontSize: '15px',
        fontWeight: 400,
        lineHeight: '24px',
      },
      subtitle2: {
        fontSize: '13px',
        fontWeight: 600,
        lineHeight: 1.54,
      },
    },
  });

const ORIGINAL_COLORS: ThemeColors = {
  alertInfoBg: '#1a2a43',
  alertWarningBg: '#3e2724',
  bgDefault: '#13171b',
  bgPaper: '#1d2027',
  divider: 'rgba(243, 247, 255, 0.10)',
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

/** Catppuccin palette → app tokens. Style guide: base pane, mantle paper, blue primary, mauve secondary. */
const fromCatppuccin = (f: CatppuccinFlavor): ThemeColors => {
  const onAccent = f.base;
  return {
    alertInfoBg: alpha(f.sky, 0.14),
    alertWarningBg: alpha(f.peach, 0.14),
    bgDefault: f.base,
    bgPaper: f.mantle,
    divider: alpha(f.overlay0, f.dark ? 0.4 : 0.55),
    errorDark: darken(f.red, 0.2),
    errorLight: f.red,
    errorMain: f.red,
    infoDark: darken(f.sky, 0.2),
    infoLight: f.sapphire,
    infoMain: f.sky,
    mode: f.dark ? 'dark' : 'light',
    onAccent,
    primaryContained: f.blue,
    primaryContainedHover: darken(f.blue, 0.1),
    primaryDark: darken(f.blue, 0.15),
    primaryLight: f.lavender,
    primaryMain: f.blue,
    scrollbarThumb: f.surface1,
    scrollbarTrack: f.crust,
    secondaryContained: f.mauve,
    secondaryContainedHover: darken(f.mauve, 0.1),
    secondaryDark: darken(f.mauve, 0.15),
    secondaryLight: f.pink,
    secondaryMain: f.mauve,
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

export const themes: Record<ThemeId, Theme> = {
  frappe: createAppTheme(fromCatppuccin(CATPPUCCIN.frappe)),
  latte: createAppTheme(fromCatppuccin(CATPPUCCIN.latte)),
  macchiato: createAppTheme(fromCatppuccin(CATPPUCCIN.macchiato)),
  mocha: createAppTheme(fromCatppuccin(CATPPUCCIN.mocha)),
  original: createAppTheme(ORIGINAL_COLORS),
};

/** Default / Original theme — prefer `themes[themeId]` when selecting. */
export const theme = themes.original;
