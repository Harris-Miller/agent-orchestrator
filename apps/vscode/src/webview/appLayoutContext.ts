import { createContext, useContext } from 'react';

export type AppLayoutApi = {
  readonly developerPanelOpen: boolean;
  readonly openDeveloperPanel: () => void;
};

export const AppLayoutContext = createContext<AppLayoutApi>({
  developerPanelOpen: false,
  openDeveloperPanel: () => undefined,
});

export const useAppLayout = (): AppLayoutApi => useContext(AppLayoutContext);
