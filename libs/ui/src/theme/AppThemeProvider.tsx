import { useAtomValue } from '@effect/atom-react';
import { ThemeProvider } from '@mui/material/styles';
import type { FC, ReactNode } from 'react';

import { effectiveThemeAtom } from '../atoms/boundHarnessAtoms.ts';

import { muiThemeOf } from './effectiveTheme.ts';

export const AppThemeProvider: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const effectiveTheme = useAtomValue(effectiveThemeAtom);

  return (
    <ThemeProvider noSsr theme={muiThemeOf(effectiveTheme)}>
      {children}
    </ThemeProvider>
  );
};
