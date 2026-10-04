import { useAtomSet, useAtomValue } from '@effect/atom-react';

import { developerModeAtom } from '../../atoms/boundHarnessAtoms.ts';
import { developerPanelOpenAtom } from '../../atoms/developerPanelOpen.atoms.ts';

/** Shared Developer panel open preference, gated by Developer mode for pane visibility. */
export const useDeveloperPanelOpen = (): {
  readonly close: () => void;
  readonly onPaneVisibleChange: (index: number, visible: boolean) => void;
  readonly visible: boolean;
} => {
  const developerMode = useAtomValue(developerModeAtom);
  const open = useAtomValue(developerPanelOpenAtom);
  const setOpen = useAtomSet(developerPanelOpenAtom);

  return {
    close: () => {
      setOpen(false);
    },
    onPaneVisibleChange: (index, visible) => {
      if (index === 1) {
        setOpen(visible);
      }
    },
    visible: developerMode && open,
  };
};
