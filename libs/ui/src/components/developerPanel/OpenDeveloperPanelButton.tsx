import { useAtomValue } from '@effect/atom-react';
import Button from '@mui/material/Button';
import type { FC } from 'react';

import { developerModeAtom } from '../../atoms/boundHarnessAtoms.ts';

/** Opens the Developer panel when Developer mode is on and the panel is closed. */
export const OpenDeveloperPanelButton: FC<{
  readonly onOpen: () => void;
  readonly open: boolean;
}> = ({ onOpen, open }) => {
  const developerMode = useAtomValue(developerModeAtom);
  if (!developerMode || open) {
    return null;
  }
  return (
    <Button onClick={onOpen} size="small" variant="outlined">
      Developer panel
    </Button>
  );
};
