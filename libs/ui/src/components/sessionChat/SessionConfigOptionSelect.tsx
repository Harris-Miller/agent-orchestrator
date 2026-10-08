import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { SelectChoiceView } from '../../host/configProbe.ts';

export const SessionConfigOptionSelect: FC<{
  readonly choices: readonly SelectChoiceView[];
  readonly disabled: boolean;
  readonly onChange: (configId: string, value: string) => void;
  readonly option: NormalizedSelectConfigOption;
}> = ({ choices, disabled, onChange, option }) => {
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
        {choices.map(choice => (
          <MenuItem disabled={choice.disabled} key={choice.id} title={choice.description} value={choice.id}>
            {choice.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
