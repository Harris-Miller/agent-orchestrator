import { useAtomValue } from '@effect/atom-react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type { FC } from 'react';

import { enabledLaunchTargetPhasesAtom } from '../../atoms/backendState.atoms.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';

export type AgentLaunchTargetMenuProps = {
  readonly anchorEl: HTMLElement | null;
  readonly creating?: boolean;
  readonly onClose: () => void;
  readonly onSelect: (launchTarget: AgentLaunchTarget) => void;
};

export const AgentLaunchTargetMenu: FC<AgentLaunchTargetMenuProps> = ({
  anchorEl,
  creating = false,
  onClose,
  onSelect,
}) => {
  const backendPhases = useAtomValue(enabledLaunchTargetPhasesAtom);

  return (
    <Menu anchorEl={anchorEl} onClose={onClose} open={anchorEl !== null}>
      {backendPhases.map(entry => (
        <MenuItem
          disabled={entry.phase !== 'ready' || creating}
          key={entry.launchTarget}
          onClick={() => {
            onSelect(entry.launchTarget);
          }}
        >
          {entry.label}
          {entry.phase !== 'ready' ? ` (${entry.phase})` : ''}
        </MenuItem>
      ))}
    </Menu>
  );
};
