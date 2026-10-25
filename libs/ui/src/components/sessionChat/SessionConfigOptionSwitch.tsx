import type { FC } from 'react';

import type { NormalizedBooleanConfigOption } from '../../host/acpSessionBootstrap.ts';
import { Switch } from '../ui/switch.tsx';

export const SessionConfigOptionSwitch: FC<{
  readonly disabled: boolean;
  readonly onChange: (configId: string, value: boolean) => void;
  readonly option: NormalizedBooleanConfigOption;
}> = ({ disabled, onChange, option }) => {
  const id = `acp-config-${option.id}`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 select-none ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      title={option.description}
    >
      <Switch
        aria-labelledby={id}
        checked={option.currentValue === true}
        disabled={disabled}
        onCheckedChange={checked => {
          onChange(option.id, checked);
        }}
      />
      <span className={disabled ? 'text-sm text-muted-foreground' : 'text-sm'} id={id}>
        {option.name}
      </span>
    </span>
  );
};
