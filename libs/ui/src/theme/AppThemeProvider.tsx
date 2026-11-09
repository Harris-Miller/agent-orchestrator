import { useAtomValue } from '@effect/atom-react';
import { ThemeProvider } from '@mui/material/styles';
import type { FC, ReactNode } from 'react';

import { themeAtom } from '../atoms/boundHarnessAtoms.ts';

import { themes } from './themes.ts';

export const AppThemeProvider: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const themeId = useAtomValue(themeAtom);
  return (
    <ThemeProvider noSsr theme={themes[themeId]}>
      {children}
    </ThemeProvider>
  );
};
