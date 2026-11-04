import { useAtomSet, useAtomValue } from '@effect/atom-react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { PanelBottomClose, PanelBottomOpen } from 'lucide-react';
import type { FC } from 'react';

import { developerModeAtom } from '../../atoms/boundHarnessAtoms.ts';
import { developerPanelOpenAtom } from '../../atoms/developerPanelOpen.atoms.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

/** Toggles the Developer panel; rendered only while Developer mode is on. */
export const ToggleDeveloperPanelButton: FC = () => {
  const developerMode = useAtomValue(developerModeAtom);
  const open = useAtomValue(developerPanelOpenAtom);
  const setOpen = useAtomSet(developerPanelOpenAtom);
  if (!developerMode) {
    return null;
  }
  const label = open ? 'Close developer panel' : 'Open developer panel';
  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        aria-pressed={open}
        onClick={() => {
          setOpen(!open);
        }}
        size="small"
      >
        <LucideMuiIcon fontSize="small" icon={open ? PanelBottomClose : PanelBottomOpen} />
      </IconButton>
    </Tooltip>
  );
};
