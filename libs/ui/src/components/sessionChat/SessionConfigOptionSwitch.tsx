import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import type { FC } from 'react';

import type { NormalizedBooleanConfigOption } from '../../host/acpSessionBootstrap.ts';

export const SessionConfigOptionSwitch: FC<{
  readonly disabled: boolean;
  readonly onChange: (configId: string, value: boolean) => void;
  readonly option: NormalizedBooleanConfigOption;
}> = ({ disabled, onChange, option }) => {
  const id = `acp-config-${option.id}`;

  return (
    <FormControlLabel
      control={
        <Switch
          checked={option.currentValue === true}
          disabled={disabled}
          id={id}
          onChange={event => {
            onChange(option.id, event.target.checked);
          }}
        />
      }
      disabled={disabled}
      label={option.name}
      title={option.description}
    />
  );
};
