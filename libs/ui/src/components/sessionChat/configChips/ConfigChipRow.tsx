import { useAtomValue } from '@effect/atom-react';
import { useMemo } from 'react';
import type { FC } from 'react';

import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';
import { modelPickerPrefsAtom } from '../../../atoms/userSettings/userSettingsDocument.atoms.ts';
import { isModelOption } from '../../../host/configOptionIndexUi.ts';
import { arrangeModelChoices } from '../../../host/modelPickerPrefs.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import { partitionComposerConfigOptions } from './partitionComposerConfigOptions.ts';
import { SessionAccessChip } from './SessionAccessChip.tsx';
import { SessionAgentChip } from './SessionAgentChip.tsx';
import type { SessionAgentChipProps } from './SessionAgentChip.tsx';
import { SessionConfigOptionControl } from './SessionConfigOptionControl.tsx';
import { SessionModelEffortChip } from './SessionModelEffortChip.tsx';

export type ConfigChipRowProps = {
  readonly agent: SessionAgentChipProps;
  readonly configOptions: readonly NormalizedConfigOption[];
  /** Disables model/effort, access and leftover controls. The agent chip follows `agent.disabled`. */
  readonly configDisabled: boolean;
  readonly onConfigChange: (diff: ConfigValueDiff) => void;
  readonly unavailableModelIds: readonly string[] | undefined;
};

/** The Config chip row: agent chip, model/effort chip, access chip, then leftover Config option controls. */
export const ConfigChipRow: FC<ConfigChipRowProps> = ({
  agent,
  configDisabled,
  configOptions,
  onConfigChange,
  unavailableModelIds,
}) => {
  const prefs = useAtomValue(modelPickerPrefsAtom(agent.value));
  const partitioned = useMemo(
    () =>
      partitionComposerConfigOptions(
        configOptions.map(option =>
          isModelOption(option) && option.type === 'select'
            ? {
                ...option,
                choices: arrangeModelChoices(option.choices, {
                  ...prefs,
                  currentId: option.currentValue,
                  unavailableIds: unavailableModelIds,
                }),
              }
            : option,
        ),
      ),
    [configOptions, prefs, unavailableModelIds],
  );

  return (
    <>
      <SessionAgentChip {...agent} />
      {partitioned.modelEffort !== undefined ? (
        <SessionModelEffortChip
          disabled={configDisabled}
          effort={partitioned.modelEffort.effort}
          model={partitioned.modelEffort.model}
          onChange={onConfigChange}
          unavailableModelIds={unavailableModelIds}
        />
      ) : null}
      {partitioned.mode !== undefined ? (
        <SessionAccessChip disabled={configDisabled} onChange={onConfigChange} option={partitioned.mode} />
      ) : null}
      {partitioned.leftovers.map(option => (
        <SessionConfigOptionControl
          disabled={configDisabled}
          key={option.id}
          onChange={onConfigChange}
          option={option}
          unavailableModelIds={unavailableModelIds}
        />
      ))}
    </>
  );
};
