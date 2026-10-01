import Box from '@mui/material/Box';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { NormalizedBooleanConfigOption } from '../../host/acpSessionBootstrap.ts';

export const SessionConfigOptionSwitch: FC<{
  readonly disabled: boolean;
  readonly onChange: (configId: string, value: boolean) => void;
  readonly option: NormalizedBooleanConfigOption;
}> = ({ disabled, onChange, option }) => {
  const id = `acp-config-${option.id}`;

  return (
    <Box
      component="label"
      htmlFor={id}
      sx={{
        alignItems: 'center',
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        gap: 0.75,
        userSelect: 'none',
      }}
      title={option.description}
    >
      <Switch
        checked={option.currentValue === true}
        disabled={disabled}
        id={id}
        onChange={event => {
          onChange(option.id, event.target.checked);
        }}
        sx={{ m: 0 }}
      />
      <Typography color={disabled ? 'text.disabled' : 'text.primary'} variant="body2">
        {option.name}
      </Typography>
    </Box>
  );
};
