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

import type { ultracodeRow } from './ultracode.ts';
import {
  isPlanOn,
  isPlanSwitch,
  NOT_AVAILABLE_FOR_MODEL,
  optionRowLabel,
  planToggleDiff,
} from './wellKnownConfigOption.ts';
import type { AbsentOptionRow } from './wellKnownConfigOption.ts';

const labelSx = { fontSize: 13 } as const;

const Row: FC<{ readonly children: ReactNode; readonly label: string; readonly title?: string }> = ({
  children,
  label,
  title,
}) => (
  <Box sx={{ alignItems: 'center', display: 'flex', gap: 2, justifyContent: 'space-between', px: 2 }} title={title}>
    <Typography sx={labelSx}>{label}</Typography>
    {children}
  </Box>
);

const SwitchRow: FC<{
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (on: boolean) => void;
  readonly title?: string;
}> = ({ checked, disabled, label, onChange, title }) => (
  <MenuItem
    disabled={disabled}
    onClick={() => {
      onChange(!checked);
    }}
    role="presentation"
    sx={{ borderRadius: 1, gap: 2, justifyContent: 'space-between' }}
    title={title}
  >
    <Typography sx={labelSx}>{label}</Typography>
    <Switch
      checked={checked}
      disabled={disabled}
      slotProps={{ input: { 'aria-label': label } }}
      onChange={event => {
        onChange(event.target.checked);
      }}
      onClick={event => {
        event.stopPropagation();
      }}
      size="small"
    />
  </MenuItem>
);

/** Claude Ultracode: always the first row, disabled with the reason as a tooltip. */
export const UltracodeOptionRow: FC<{
  readonly disabled: boolean;
  readonly onToggle: (on: boolean) => void;
  readonly row: NonNullable<ReturnType<typeof ultracodeRow>>;
}> = ({ disabled, onToggle, row }) => (
  <Tooltip title={row.disabledReason ?? ''}>
    <span>
      <SwitchRow
        checked={row.on}
        disabled={disabled || row.disabledReason !== undefined}
        label={row.label}
        onChange={onToggle}
      />
    </span>
  </Tooltip>
);

/** One Config option as a label + control row: the Plan switch is bespoke (a dropdown if it ever has more than default|plan), others get the generic control for their `type`. */
export const OptionRow: FC<{
  readonly disabled: boolean;
  readonly launchTarget: AgentLaunchTarget | undefined;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly option: NormalizedConfigOption;
}> = ({ disabled, launchTarget, onChange, option }) => {
  const label = optionRowLabel(launchTarget, option);

  if (option.type === 'boolean') {
    return (
      <SwitchRow
        checked={option.currentValue === true}
        disabled={disabled}
        label={label}
        onChange={on => {
          onChange({ configId: option.id, type: 'boolean', value: on });
        }}
        title={option.description}
      />
    );
  }
  if (isPlanSwitch(launchTarget, option)) {
    return (
      <SwitchRow
        checked={isPlanOn(option)}
        disabled={disabled}
        label={label}
        onChange={on => {
          onChange(planToggleDiff(option, on));
        }}
        title={option.description}
      />
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

/** A well-known option the session did not report for this model: off, disabled, with the reason as a tooltip. */
export const AbsentOptionRowView: FC<{ readonly row: AbsentOptionRow }> = ({ row }) => (
  <Tooltip title={NOT_AVAILABLE_FOR_MODEL}>
    <span>
      <SwitchRow checked={false} disabled label={row.label} onChange={() => undefined} />
    </span>
  </Tooltip>
);
