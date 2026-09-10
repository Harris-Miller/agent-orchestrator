import { createContext, useContext } from 'react';

import type { ThemeId } from './theme.ts';

export type ThemeChoiceContextValue = {
  readonly setThemeId: (id: ThemeId) => void;
  readonly themeId: ThemeId;
};

export const ThemeChoiceContext = createContext<null | ThemeChoiceContextValue>(null);

export const useThemeChoice = (): ThemeChoiceContextValue => {
  const value = useContext(ThemeChoiceContext);
  if (value == null) {
    throw new Error('useThemeChoice must be used within AppThemeProvider');
  }
  return value;
};
