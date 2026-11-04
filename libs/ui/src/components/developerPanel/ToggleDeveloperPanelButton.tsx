import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { PanelBottomClose, PanelBottomOpen } from 'lucide-react';
import type { FC } from 'react';

import { developerModeAtom } from '../../atoms/boundHarnessAtoms.ts';
import { developerPanelOpenAtom } from '../../atoms/developerPanelOpen.atoms.ts';
import { IconTooltipButton } from '../IconTooltipButton.tsx';

export const CLOSE_DEVELOPER_PANEL_LABEL = 'Close developer panel';

/** Toggles the Developer panel; rendered only while Developer mode is on. */
export const ToggleDeveloperPanelButton: FC = () => {
  const developerMode = useAtomValue(developerModeAtom);
  const open = useAtomValue(developerPanelOpenAtom);
  const setOpen = useAtomSet(developerPanelOpenAtom);
  if (!developerMode) {
    return null;
  }
  return (
    <IconTooltipButton
      icon={open ? PanelBottomClose : PanelBottomOpen}
      label={open ? CLOSE_DEVELOPER_PANEL_LABEL : 'Open developer panel'}
      onClick={() => {
        setOpen(!open);
      }}
    />
  );
};
