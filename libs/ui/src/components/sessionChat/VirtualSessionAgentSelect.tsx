import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { FC } from 'react';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from '../../host/agentLaunchTarget.ts';

/** Virtual-only agent launch target picker (before session/new). */
export const VirtualSessionAgentSelect: FC<{
  readonly disabled: boolean;
  readonly onChange: (launchTarget: AgentLaunchTarget | undefined) => void;
  readonly readyLaunchTargets: readonly AgentLaunchTarget[];
  readonly value: AgentLaunchTarget | undefined;
}> = ({ disabled, onChange, readyLaunchTargets, value }) => (
  <FormControl disabled={disabled} fullWidth size="small">
    <InputLabel id="virtual-session-launch-target-label">Agent</InputLabel>
    <Select<'' | AgentLaunchTarget>
      displayEmpty
      label="Agent"
      labelId="virtual-session-launch-target-label"
      onChange={event => {
        const next = event.target.value;
        onChange(next === '' ? undefined : next);
      }}
      value={value ?? ''}
    >
      <MenuItem disabled value="">
        <em>Select agent</em>
      </MenuItem>
      {readyLaunchTargets.map(launchTarget => (
        <MenuItem key={launchTarget} value={launchTarget}>
          {agentLaunchTargetLabel(launchTarget)}
        </MenuItem>
      ))}
    </Select>
  </FormControl>
);
