import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Button from '@mui/material/Button';
import type { FC } from 'react';

import { developerModeAtom } from '../../atoms/boundHarnessAtoms.ts';
import { developerPanelOpenAtom } from '../../atoms/developerPanelOpen.atoms.ts';

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
      size="small"
      variant="outlined"
    >
      Developer panel
    </Button>
  );
};
