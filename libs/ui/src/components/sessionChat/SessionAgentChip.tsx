import Check from '@mui/icons-material/Check';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC, MouseEvent } from 'react';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from '../../host/agentLaunchTarget.ts';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';

/** Agent launch target chip — Menu when editable (Virtual / handoff); inert Chip otherwise. */
export const SessionAgentChip: FC<{
  readonly disabled?: boolean;
  readonly interactive: boolean;
  readonly onChange?: (launchTarget: AgentLaunchTarget) => void;
  readonly readyLaunchTargets: readonly AgentLaunchTarget[];
  readonly value: AgentLaunchTarget | undefined;
}> = ({ disabled = false, interactive, onChange, readyLaunchTargets, value }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const label = value === undefined ? 'Agent' : agentLaunchTargetLabel(value);

  return (
    <>
      <ComposerChromeChip
        disabled={disabled}
        interactive={interactive}
        onClick={(event: MouseEvent<HTMLElement>) => {
          setAnchorEl(event.currentTarget);
        }}
      >
        <Typography component="span" sx={{ color: 'text.primary', fontSize: 13, fontWeight: 600 }}>
          {label}
        </Typography>
      </ComposerChromeChip>
      {interactive ? (
        <Menu
          anchorEl={anchorEl}
          anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
          onClose={() => {
            setAnchorEl(null);
          }}
          open={anchorEl !== null}
          transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        >
          {readyLaunchTargets.map(launchTarget => (
            <MenuItem
              key={launchTarget}
              onClick={() => {
                onChange?.(launchTarget);
                setAnchorEl(null);
              }}
              selected={value === launchTarget}
            >
              <ListItemText>{agentLaunchTargetLabel(launchTarget)}</ListItemText>
              {value === launchTarget ? (
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <Check fontSize="small" />
                </ListItemIcon>
              ) : null}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </>
  );
};
