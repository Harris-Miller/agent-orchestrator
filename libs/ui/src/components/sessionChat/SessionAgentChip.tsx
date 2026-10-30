import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from '../../host/agentLaunchTarget.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { useComposerChromeMenu } from './composerChromeMenu.ts';

/** Agent launch target chip — Menu when editable (Virtual / handoff); inert Chip otherwise. */
export const SessionAgentChip: FC<{
  readonly disabled?: boolean;
  readonly interactive: boolean;
  readonly onChange?: (launchTarget: AgentLaunchTarget) => void;
  readonly selectableLaunchTargets: readonly AgentLaunchTarget[];
  readonly value: AgentLaunchTarget | undefined;
}> = ({ disabled = false, interactive, onChange, selectableLaunchTargets, value }) => {
  const menu = useComposerChromeMenu();
  const label = value === undefined ? 'Agent' : agentLaunchTargetLabel(value);

  return (
    <>
      <ComposerChromeChip disabled={disabled} interactive={interactive} onClick={menu.openFromClick}>
        {value !== undefined ? <AgentLaunchTargetIcon launchTarget={value} size={14} /> : null}
        <Typography component="span" sx={{ color: 'text.primary', fontSize: 13, fontWeight: 600 }}>
          {label}
        </Typography>
      </ComposerChromeChip>
      {interactive ? (
        <Menu {...menu.menuProps}>
          {selectableLaunchTargets.map(launchTarget => (
            <MenuItem
              key={launchTarget}
              onClick={() => {
                onChange?.(launchTarget);
                menu.close();
              }}
              selected={value === launchTarget}
            >
              <ListItemIcon>
                <AgentLaunchTargetIcon launchTarget={launchTarget} />
              </ListItemIcon>
              <ListItemText>{agentLaunchTargetLabel(launchTarget)}</ListItemText>
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </>
  );
};
