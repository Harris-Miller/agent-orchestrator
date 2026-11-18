import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { FC, ReactNode } from 'react';

import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import type { ultraRow } from './ultra.ts';
import { isPlanOn, optionControlKind, optionRowLabel, planToggleDiff } from './wellKnownConfigOption.ts';

const labelSx = { fontSize: 13 } as const;

const Row: FC<{ readonly children: ReactNode; readonly label: string; readonly title?: string }> = ({
  children,
  label,
  title,
}) => (
  <Box sx={{ alignItems: 'center', display: 'flex', gap: 2, justifyContent: 'space-between' }} title={title}>
    <Typography sx={labelSx}>{label}</Typography>
    {children}
  </Box>
);

/** Ultra / Ultracode: always the first row, disabled with the reason as a tooltip. */
export const UltraOptionRow: FC<{
  readonly disabled: boolean;
  readonly onToggle: (on: boolean) => void;
  readonly row: NonNullable<ReturnType<typeof ultraRow>>;
}> = ({ disabled, onToggle, row }) => (
  <Tooltip title={row.disabledReason ?? ''}>
    <span>
      <Row label={row.label}>
        <Switch
          checked={row.on}
          disabled={disabled || row.disabledReason !== undefined}
          slotProps={{ input: { 'aria-label': row.label } }}
          onChange={event => {
            onToggle(event.target.checked);
          }}
          size="small"
        />
      </Row>
    </span>
  </Tooltip>
);

/** One Config option as a label + control row: bespoke for well-known options, generic by `type` otherwise. */
export const OptionRow: FC<{
  readonly disabled: boolean;
  readonly launchTarget: AgentLaunchTarget | undefined;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly option: NormalizedConfigOption;
}> = ({ disabled, launchTarget, onChange, option }) => {
  const label = optionRowLabel(launchTarget, option);
  const kind = optionControlKind(launchTarget, option);

  if (option.type === 'boolean') {
    return (
      <Row label={label} title={option.description}>
        <Switch
          checked={option.currentValue === true}
          disabled={disabled}
          slotProps={{ input: { 'aria-label': label } }}
          onChange={event => {
            onChange({ configId: option.id, type: 'boolean', value: event.target.checked });
          }}
          size="small"
        />
      </Row>
    );
  }
  if (kind === 'plan-toggle') {
    return (
      <Row label={label} title={option.description}>
        <Switch
          checked={isPlanOn(option)}
          disabled={disabled}
          slotProps={{ input: { 'aria-label': label } }}
          onChange={event => {
            onChange(planToggleDiff(option, event.target.checked));
          }}
          size="small"
        />
      </Row>
    );
  }
  if (option.choices.length === 0) {
    return null;
  }
  return (
    <Row label={label} title={option.description}>
      <Select
        disabled={disabled}
        slotProps={{ input: { 'aria-label': label } }}
        onChange={event => {
          onChange({ configId: option.id, type: 'select', value: event.target.value });
        }}
        size="small"
        sx={{ fontSize: 13, minWidth: 120 }}
        value={option.currentValue ?? ''}
      >
        {option.choices.map(choice => (
          <MenuItem key={choice.id} value={choice.id}>
            {choice.name}
          </MenuItem>
        ))}
      </Select>
    </Row>
  );
};
