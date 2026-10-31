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
  /** Rows not listed here render disabled with their reason. Omit to treat every row as ready. */
  readonly readyLaunchTargets?: readonly AgentLaunchTarget[];
  readonly selectableLaunchTargets: readonly AgentLaunchTarget[];
  readonly unavailableReasons?: Readonly<Partial<Record<AgentLaunchTarget, string>>>;
  readonly value: AgentLaunchTarget | undefined;
}> = ({
  disabled = false,
  interactive,
  onChange,
  readyLaunchTargets,
  selectableLaunchTargets,
  unavailableReasons,
  value,
}) => {
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
              disabled={readyLaunchTargets !== undefined && !readyLaunchTargets.includes(launchTarget)}
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
              <ListItemText secondary={unavailableReasons?.[launchTarget]}>
                {agentLaunchTargetLabel(launchTarget)}
              </ListItemText>
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </>
  );
};
