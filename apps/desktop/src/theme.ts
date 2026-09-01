import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
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
                backgroundColor: '#1a2a43',
                color: '#4c97ff',
              },
            },
            {
              props: { severity: 'success', variant: 'standard' },
              style: {
                backgroundColor: 'rgba(0, 135, 101, 0.14)',
                color: '#43bf9f',
              },
            },
            {
              props: { severity: 'warning', variant: 'standard' },
              style: {
                backgroundColor: '#3e2724',
                color: '#ff8a66',
              },
            },
            {
              props: { severity: 'error', variant: 'standard' },
              style: {
                backgroundColor: 'rgba(215, 53, 74, 0.14)',
                color: '#ff6b6b',
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
          backgroundColor: '#1d2027',
          backgroundImage: 'none',
          boxShadow: '0 1px 0 rgba(0, 0, 0, 0.12)',
          color: '#ffffff',
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
            backgroundColor: 'rgba(96, 167, 255, 0.08)',
          },
          fontSize: '13px',
          minHeight: '30px',
        },
        paper: {
          backgroundColor: '#1d2027',
          border: '1px solid rgba(243, 247, 255, 0.10)',
          borderRadius: '6px',
          boxShadow: '0 16px 38px rgba(0, 0, 0, 0.24)',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        // size: 'medium', // MUI v9 default.
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
                  backgroundColor: '#3178c6',
                },
                backgroundColor: '#1061ad',
                color: '#ffffff',
              },
            },
            {
              props: { color: 'secondary', variant: 'contained' },
              style: {
                '&:hover': {
                  backgroundColor: '#b476dc',
                },
                backgroundColor: '#9d62c4',
                color: '#ffffff',
              },
            },
            {
              props: { color: 'primary', variant: 'text' },
              style: {
                '&:hover': {
                  backgroundColor: 'rgba(96, 167, 255, 0.12)',
                },
                backgroundColor: 'rgba(96, 167, 255, 0.08)',
                color: '#60a7ff',
              },
            },
            {
              props: { variant: 'outlined' },
              style: {
                '&:hover': {
                  backgroundColor: 'rgba(96, 167, 255, 0.08)',
                  borderColor: 'rgba(96, 167, 255, 0.44)',
                },
                borderColor: 'rgba(243, 247, 255, 0.10)',
              },
            },
          ],
        },
      },
    },
    MuiCard: {
      // defaultProps: { elevation: 1 }, // MUI v9 default.
      styleOverrides: {
        root: {
          backgroundColor: '#1d2027',
          backgroundImage: 'none',
          border: '1px solid rgba(243, 247, 255, 0.10)',
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
          backgroundColor: '#1d2027',
          border: '1px solid rgba(243, 247, 255, 0.10)',
          borderRadius: '4px',
          color: '#ffffff',
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
                backgroundColor: '#1061ad',
                borderColor: '#1061ad',
              },
            },
            {
              props: { color: 'success', variant: 'filled' },
              style: {
                backgroundColor: '#008765',
                borderColor: '#008765',
              },
            },
            {
              props: { color: 'warning', variant: 'filled' },
              style: {
                backgroundColor: '#e15428',
                borderColor: '#e15428',
              },
            },
            {
              props: { color: 'error', variant: 'filled' },
              style: {
                backgroundColor: '#d7354a',
                borderColor: '#d7354a',
              },
            },
            {
              props: { color: 'success', variant: 'outlined' },
              style: {
                borderColor: '#008765',
                color: '#43bf9f',
              },
            },
            {
              props: { color: 'warning', variant: 'outlined' },
              style: {
                borderColor: '#e15428',
                color: '#ff8a66',
              },
            },
            {
              props: { color: 'error', variant: 'outlined' },
              style: {
                borderColor: '#d7354a',
                color: '#ff6b6b',
              },
            },
          ],
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        '::selection': {
          backgroundColor: 'rgba(96, 167, 255, 0.28)',
        },
        '*': {
          scrollbarColor: '#454b58 #13171b',
          scrollbarWidth: 'thin',
        },
        body: {
          backgroundColor: '#13171b',
          color: '#f3f7ff',
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
          backgroundColor: '#1d2027',
          border: '1px solid rgba(243, 247, 255, 0.10)',
          borderRadius: '8px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.26)',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(243, 247, 255, 0.10)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1d2027',
          backgroundImage: 'none',
          borderRight: '1px solid rgba(243, 247, 255, 0.10)',
          color: '#f3f7ff',
          paddingTop: '8px',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(96, 167, 255, 0.08)',
            color: '#60a7ff',
          },
          '&.MuiIconButton-sizeSmall': {
            height: '22px',
            padding: 0,
            width: '22px',
          },
          borderRadius: '4px',
          color: '#a0a7b5',
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
            color: '#a0a7b5',
            opacity: 1,
          },
          boxSizing: 'border-box',
          height: '20px',
          padding: '4px 8px',
        },
        root: {
          '&:hover': {
            borderColor: 'rgba(96, 167, 255, 0.44)',
          },
          '&.Mui-disabled': {
            backgroundColor: 'rgba(158, 165, 180, 0.12)',
            color: '#a0a7b5',
          },
          '&.Mui-focused': {
            borderColor: '#60a7ff',
            boxShadow: '0 0 0 1px rgba(96, 167, 255, 0.22)',
          },
          '&.MuiInputBase-sizeSmall': {
            minHeight: '22px',
          },
          backgroundColor: 'transparent',
          border: '1px solid rgba(243, 247, 255, 0.10)',
          borderRadius: '4px',
          color: '#f3f7ff',
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
          color: '#60a7ff',
          textDecorationColor: 'rgba(96, 167, 255, 0.44)',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(243, 247, 255, 0.05)',
          },
          '&.Mui-selected': {
            '&:hover': {
              backgroundColor: 'rgba(96, 167, 255, 0.12)',
            },
            backgroundColor: 'rgba(96, 167, 255, 0.08)',
            color: '#60a7ff',
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
          backgroundColor: '#1d2027',
          border: '1px solid rgba(243, 247, 255, 0.10)',
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
          backgroundColor: '#1d2027',
          border: '1px solid rgba(243, 247, 255, 0.10)',
          boxShadow: '0 16px 38px rgba(0, 0, 0, 0.24)',
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: '#a0a7b5',
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
          backgroundColor: '#1d2027',
          border: '1px solid rgba(243, 247, 255, 0.10)',
          borderRadius: '6px',
          boxShadow: '0 16px 38px rgba(0, 0, 0, 0.24)',
          color: '#f3f7ff',
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
              backgroundColor: '#60a7ff',
              opacity: 1,
            },
            color: '#ffffff',
            transform: 'translateX(14px)',
          },
          color: '#ffffff',
          padding: '2px',
        },
        thumb: {
          boxShadow: 'none',
          height: '16px',
          width: '16px',
        },
        track: {
          backgroundColor: '#575d6b',
          borderRadius: '10px',
          opacity: 1,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            color: '#60a7ff',
          },
          color: 'rgba(214, 223, 242, 0.70)',
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
          color: 'rgba(214, 223, 242, 0.70)',
          fontWeight: 600,
        },
        root: {
          borderBottom: '1px solid rgba(243, 247, 255, 0.10)',
          color: '#f3f7ff',
          fontSize: '13px',
          fontWeight: 400,
          lineHeight: 1.54,
          padding: '6px 13px',
        },
        stickyHeader: {
          backgroundColor: '#1d2027',
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: '#1d2027',
          border: '1px solid rgba(243, 247, 255, 0.10)',
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
            backgroundColor: 'rgba(96, 167, 255, 0.08)',
          },
        },
      },
    },
    MuiTabs: {
      // defaultProps: {
      //   indicatorColor: 'primary',
      //   textColor: 'primary',
      // }, // MUI v9 defaults.
      styleOverrides: {
        indicator: {
          backgroundColor: '#60a7ff',
          height: '2px',
        },
        root: {
          borderBottom: '1px solid rgba(243, 247, 255, 0.10)',
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
          color: '#1d2027',
        },
        tooltip: {
          backgroundColor: 'rgba(29, 32, 39, 0.98)',
          border: '1px solid rgba(243, 247, 255, 0.10)',
          borderRadius: '4px',
          boxShadow: '0 10px 24px rgba(0, 0, 0, 0.20)',
          color: '#f3f7ff',
          fontSize: '12px',
        },
      },
    },
  },
  // cssVariables: false, // MUI v9 default.
  // direction: 'ltr', // MUI v9 default.
  // spacing: 8, // MUI v9 default; the observed UI uses this scale with fractional steps.
  // shape: { borderRadius: 4 }, // MUI v9 default and the dominant control radius.
  // breakpoints: {
  //   values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 },
  // }, // MUI v9 defaults.
  // zIndex: {
  //   mobileStepper: 1000,
  //   fab: 1050,
  //   speedDial: 1050,
  //   appBar: 1100,
  //   drawer: 1200,
  //   modal: 1300,
  //   snackbar: 1400,
  //   tooltip: 1500,
  // }, // MUI v9 defaults.
  // transitions: {
  //   easing: {
  //     easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  //     easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
  //     easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  //     sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
  //   },
  //   duration: {
  //     shortest: 150,
  //     shorter: 200,
  //     short: 250,
  //     standard: 300,
  //     complex: 375,
  //     enteringScreen: 225,
  //     leavingScreen: 195,
  //   },
  // }, // MUI v9 defaults.
  palette: {
    action: {
      active: '#f3f7ff',
      disabled: '#a0a7b5',
      disabledBackground: 'rgba(158, 165, 180, 0.12)',
      focus: 'rgba(96, 167, 255, 0.12)',
      hover: 'rgba(243, 247, 255, 0.05)',
      selected: 'rgba(96, 167, 255, 0.08)',
    },
    background: {
      default: '#13171b',
      paper: '#1d2027',
    },
    divider: 'rgba(243, 247, 255, 0.10)',
    error: {
      contrastText: '#ffffff',
      dark: '#962533',
      light: '#ff6b6b',
      main: '#d7354a',
    },
    info: {
      contrastText: '#ffffff',
      dark: '#1a5fa8',
      light: '#71beff',
      main: '#4c97ff',
    },
    mode: 'dark',
    // common: { black: '#000000', white: '#ffffff' }, // MUI v9 defaults.
    primary: {
      contrastText: '#ffffff',
      dark: '#1061ad',
      light: '#71beff',
      main: '#60a7ff',
    },
    secondary: {
      contrastText: '#ffffff',
      dark: '#9d62c4',
      light: '#e1adff',
      main: '#d48fff',
    },
    success: {
      contrastText: '#ffffff',
      dark: '#00664d',
      light: '#43bf9f',
      main: '#008765',
    },
    text: {
      disabled: '#a0a7b5',
      primary: '#f3f7ff',
      secondary: 'rgba(214, 223, 242, 0.70)',
    },
    warning: {
      contrastText: '#ffffff',
      dark: '#9f351c',
      light: '#ff8a66',
      main: '#e15428',
    },
    // contrastThreshold: 3, // MUI v9 default.
    // tonalOffset: 0.2, // MUI v9 default.
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
    // htmlFontSize: 16, // MUI v9 default.
    // fontWeightLight: 300, // MUI v9 default.
    // fontWeightRegular: 400, // MUI v9 default.
    fontWeightMedium: 600,
    // fontWeightBold: 700, // MUI v9 default.
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
