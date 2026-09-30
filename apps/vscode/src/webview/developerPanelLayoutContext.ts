import { createContext, useContext } from 'react';

export type DeveloperPanelLayoutApi = {
  readonly developerPanelOpen: boolean;
  readonly openDeveloperPanel: () => void;
};

export const DeveloperPanelLayoutContext = createContext<DeveloperPanelLayoutApi>({
  developerPanelOpen: false,
  openDeveloperPanel: () => undefined,
});

export const useDeveloperPanelLayout = (): DeveloperPanelLayoutApi => useContext(DeveloperPanelLayoutContext);
