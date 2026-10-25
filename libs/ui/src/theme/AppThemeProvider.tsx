import { useAtomValue } from '@effect/atom-react';
import { useLayoutEffect } from 'react';
import type { FC, ReactNode } from 'react';

import { themeAtom } from '../atoms/boundHarnessAtoms.ts';

import { applyDocumentTheme } from './themePaintCache.ts';

/** Applies the Theme preference's semantic tokens. The paint cache covers the first paint. */
export const AppThemeProvider: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const themeId = useAtomValue(themeAtom);

  useLayoutEffect(() => {
    applyDocumentTheme(themeId);
  }, [themeId]);

  return children;
};
