import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { useEffect } from 'react';

import { developerModeAtom } from '../../atoms/boundHarnessAtoms.ts';
import { developerPanelOpenAtom } from '../../atoms/developerPanelOpen.atoms.ts';

/** Persist-close the Developer panel when Developer mode is turned off. */
export const useCloseDeveloperPanelWhenModeOff = (): void => {
  const developerMode = useAtomValue(developerModeAtom);
  const open = useAtomValue(developerPanelOpenAtom);
  const setOpen = useAtomSet(developerPanelOpenAtom);

  useEffect(() => {
    if (!developerMode && open) {
      setOpen(false);
    }
  }, [developerMode, open, setOpen]);
};
