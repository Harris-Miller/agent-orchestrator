import type { FC } from 'react';

import type { NormalizedConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';

import { SessionConfigOptionSelect } from './SessionConfigOptionSelect.tsx';
import { SessionConfigOptionSwitch } from './SessionConfigOptionSwitch.tsx';

export const SessionConfigOptionControl: FC<{
  readonly disabled: boolean;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly option: NormalizedConfigOption;
  readonly unavailableModelIds?: readonly string[];
}> = ({ disabled, onChange, option, unavailableModelIds }) => {
  if (option.type === 'boolean') {
    return (
      <SessionConfigOptionSwitch
        disabled={disabled}
        onChange={(configId, value) => {
          onChange({ configId, type: 'boolean', value });
        }}
        option={option}
      />
    );
  }
  if (option.choices.length === 0) {
    return null;
  }
  return (
    <SessionConfigOptionSelect
      disabled={disabled}
      onChange={(configId, value) => {
        onChange({ configId, type: 'select', value });
      }}
      option={option}
      unavailableModelIds={unavailableModelIds}
    />
  );
};
