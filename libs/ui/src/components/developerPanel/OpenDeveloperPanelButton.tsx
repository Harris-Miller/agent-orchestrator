import { useAtomSet, useAtomValue } from '@effect/atom-react';
import type { FC } from 'react';

import { developerModeAtom } from '../../atoms/boundHarnessAtoms.ts';
import { developerPanelOpenAtom } from '../../atoms/developerPanelOpen.atoms.ts';
import { Button } from '../ui/button.tsx';

/** Opens the Developer panel when Developer mode is on and the panel is closed. */
export const OpenDeveloperPanelButton: FC = () => {
  const developerMode = useAtomValue(developerModeAtom);
  const open = useAtomValue(developerPanelOpenAtom);
  const setOpen = useAtomSet(developerPanelOpenAtom);
  if (!developerMode || open) {
    return null;
  }
  return (
    <Button
      onClick={() => {
        setOpen(true);
      }}
      size="sm"
      variant="outline"
    >
      Developer panel
    </Button>
  );
};
