import { useAtomValue } from '@effect/atom-react';
import { ThemeProvider } from '@mui/material/styles';
import { useLayoutEffect } from 'react';
import type { FC, ReactNode } from 'react';

import { themeAtom } from '../atoms/boundHarnessAtoms.ts';

import { applyDocumentTheme } from './themePaintCache.ts';
import { themes } from './themes.ts';

export const AppThemeProvider: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const themeId = useAtomValue(themeAtom);

  useLayoutEffect(() => {
    applyDocumentTheme(themeId);
  }, [themeId]);

  return (
    <ThemeProvider noSsr theme={themes[themeId]}>
      {children}
    </ThemeProvider>
  );
};
