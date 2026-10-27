/**
 * PROTOTYPE (throwaway) — draft desktop-chrome overrides for issue #163.
 * Question: does this chrome direction feel right on a full MUI specimen page?
 * Not production theme code; fold validated bits into libs/ui/src/theme/themes.ts later.
 */
import { alpha, createTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

export const PROTOTYPE_UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui';
export const PROTOTYPE_MONO_FONT = '"SF Mono", Menlo, Consolas, monospace';

const hairlineShadow = 'none';
const flatShadows = [
  'none',
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
  hairlineShadow,
] as Theme['shadows'];

/** Merge draft #163 chrome onto the active palette theme (colors stay). */
export const createPrototypeDesktopChromeTheme = (base: Theme): Theme => {
  const { divider } = base.palette;
  const textMuted = base.palette.text.disabled;
  const bgPaper = base.palette.background.paper;

  return createTheme(base, {
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
            borderBottom: `1px solid ${divider}`,
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          content: { margin: 0 },
          root: { minHeight: 32, paddingLeft: 8, paddingRight: 8 },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontSize: 13,
            padding: '4px 10px',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            '&.MuiButton-sizeSmall': {
              borderRadius: 4,
              fontSize: 12,
              minHeight: 24,
              padding: '0 8px',
            },
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: 0,
            minHeight: 28,
            minWidth: 0,
            padding: '0 10px',
            textTransform: 'none',
          },
        },
      },
      MuiButtonGroup: {
        styleOverrides: {
          grouped: { borderRadius: 0 },
          root: { borderRadius: 4 },
        },
      },
      MuiCheckbox: {
        styleOverrides: {
          root: { padding: 4 },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontSize: 12,
            height: 22,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            border: `1px solid ${divider}`,
            borderRadius: 6,
            boxShadow: 'none',
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: { root: { padding: '8px 12px' } },
      },
      MuiDialogContent: {
        styleOverrides: { root: { padding: '8px 12px' } },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: { fontSize: 14, fontWeight: 600, padding: '10px 12px' },
        },
      },
      MuiFormControlLabel: {
        styleOverrides: {
          root: { marginLeft: 0, marginRight: 8 },
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
            '&.MuiIconButton-sizeSmall': { height: 24, width: 24 },
            borderRadius: 4,
            height: 28,
            padding: 4,
            width: 28,
          },
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
            boxSizing: 'border-box',
            height: 20,
            padding: '4px 8px',
          },
          root: {
            '&.MuiInputBase-adornedStart': {
              paddingLeft: 6,
            },
            '&.MuiInputBase-sizeSmall': { minHeight: 24 },
            border: `1px solid ${divider}`,
            borderRadius: 4,
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
      MuiListItemButton: {
        styleOverrides: {
          root: { borderRadius: 4, minHeight: 32 },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: { minWidth: 28 },
        },
      },
      MuiMenu: {
        styleOverrides: {
          list: { padding: 2 },
          paper: {
            border: `1px solid ${divider}`,
            borderRadius: 6,
            boxShadow: 'none',
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: { fontSize: 13, minHeight: 32 },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          input: {
            boxSizing: 'border-box',
            height: 20,
            padding: '4px 8px',
          },
          // Stock MUI leaves a wide left inset when a start adornment is present.
          inputAdornedStart: {
            paddingLeft: 0,
          },
          notchedOutline: { border: 0 },
          root: {
            '&.MuiInputBase-adornedStart': {
              paddingLeft: 6,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: bgPaper,
            backgroundImage: 'none',
          },
          rounded: { borderRadius: 6 },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            border: `1px solid ${divider}`,
            borderRadius: 6,
            boxShadow: 'none',
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          icon: { color: textMuted },
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
      MuiSwitch: {
        // Compact track; pin switchBase so thumb stays vertically centered (incl. size="small").
        styleOverrides: {
          root: {
            height: 20,
            padding: 0,
            width: 34,
          },
          switchBase: {
            '&.Mui-checked': {
              transform: 'translateX(14px)',
            },
            padding: 2,
            top: 0,
          },
          thumb: {
            boxShadow: 'none',
            height: 16,
            width: 16,
          },
          track: {
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
            fontSize: 13,
            fontWeight: 600,
            minHeight: 32,
            padding: '0 10px',
            textTransform: 'none',
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { height: 2 },
          root: { minHeight: 32 },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: alpha(bgPaper, 0.98),
            border: `1px solid ${divider}`,
            borderRadius: 4,
            boxShadow: 'none',
            color: base.palette.text.primary,
            fontSize: 12,
          },
        },
      },
    },
    shadows: flatShadows,
    shape: { borderRadius: 4 },
    typography: {
      body1: { fontSize: 13, lineHeight: 1.45 },
      body2: { fontSize: 12, lineHeight: 1.45 },
      button: {
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: 0,
        textTransform: 'none',
      },
      caption: { fontSize: 11, lineHeight: 1.35 },
      fontFamily: PROTOTYPE_UI_FONT,
      fontSize: 13,
      h1: { fontSize: 22, fontWeight: 700 },
      h2: { fontSize: 18, fontWeight: 700 },
      h3: { fontSize: 15, fontWeight: 700 },
      h4: { fontSize: 13, fontWeight: 700 },
      h5: { fontSize: 12, fontWeight: 700 },
      h6: { fontSize: 12, fontWeight: 700 },
      subtitle1: { fontSize: 14 },
      subtitle2: { fontSize: 13, fontWeight: 600 },
    },
  });
};
