import type { FC } from 'react';

import type { NormalizedConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { ConfigOptionIndex } from '../../host/configProbe.ts';
import { selectChoiceViews } from '../../host/configProbe.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';

import { SessionConfigOptionSelect } from './SessionConfigOptionSelect.tsx';
import { SessionConfigOptionSwitch } from './SessionConfigOptionSwitch.tsx';

export const SessionConfigOptionControl: FC<{
  readonly configOptionIndex?: ConfigOptionIndex;
  readonly disabled: boolean;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly option: NormalizedConfigOption;
}> = ({ configOptionIndex, disabled, onChange, option }) => {
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
      choices={selectChoiceViews(option, configOptionIndex)}
      disabled={disabled}
      onChange={(configId, value) => {
        onChange({ configId, type: 'select', value });
      }}
      option={option}
    />
  );
};
