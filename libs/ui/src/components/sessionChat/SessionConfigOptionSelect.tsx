import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { FC } from 'react';

import type { NormalizedConfigOption } from '../../host/acpSessionBootstrap.ts';

export const SessionConfigOptionSelect: FC<{
  readonly disabled: boolean;
  readonly onChange: (configId: string, value: string) => void;
  readonly option: NormalizedConfigOption;
}> = ({ disabled, onChange, option }) => {
  const labelId = `acp-config-${option.id}-label`;

  return (
    <FormControl disabled={disabled} size="small" sx={{ minWidth: 180 }}>
      <InputLabel id={labelId}>{option.name}</InputLabel>
      <Select
        label={option.name}
        labelId={labelId}
        onChange={event => {
          onChange(option.id, event.target.value);
        }}
        value={option.currentValue ?? ''}
      >
        {option.choices.map(choice => (
          <MenuItem key={choice.id} title={choice.description} value={choice.id}>
            {choice.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
