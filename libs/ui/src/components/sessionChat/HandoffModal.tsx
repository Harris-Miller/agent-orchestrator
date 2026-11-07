import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useMemo, useState } from 'react';
import type { FC } from 'react';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { hardResetForAgent, optionsWithValues, rowForModel } from '../../host/configOptionIndexUi.ts';
import { preserveConfigValuesOnModelChange } from '../../host/configProbe.ts';
import type { ConfigOptionIndex, ConfigOptionValues } from '../../host/configProbe.ts';
import type { ConfigValueDiff } from '../../host/sessionConfiguration.ts';

import { partitionComposerConfigOptions } from './partitionComposerConfigOptions.ts';
import { SessionAccessChip } from './SessionAccessChip.tsx';
import { SessionAgentChip } from './SessionAgentChip.tsx';
import { SessionConfigOptionControl } from './SessionConfigOptionControl.tsx';
import { SessionModelEffortChip } from './SessionModelEffortChip.tsx';

const initialLaunchTarget = (
  usableLaunchTargets: readonly AgentLaunchTarget[],
  sourceLaunchTarget: AgentLaunchTarget,
): AgentLaunchTarget | undefined =>
  usableLaunchTargets.includes(sourceLaunchTarget) ? sourceLaunchTarget : usableLaunchTargets[0];

export const HandoffModal: FC<{
  readonly getConfigOptionIndex: (launchTarget: AgentLaunchTarget) => ConfigOptionIndex | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: (arg: { configValues: ConfigOptionValues; targetLaunchTarget: AgentLaunchTarget }) => void;
  readonly open: boolean;
  readonly usableLaunchTargets: readonly AgentLaunchTarget[];
  readonly selectableLaunchTargets: readonly AgentLaunchTarget[];
  readonly sourceLaunchTarget: AgentLaunchTarget;
  readonly unavailableReasons?: Readonly<Partial<Record<AgentLaunchTarget, string>>>;
}> = ({
  getConfigOptionIndex,
  onCancel,
  onConfirm,
  open,
  usableLaunchTargets,
  selectableLaunchTargets,
  sourceLaunchTarget,
  unavailableReasons,
}) => {
  const [targetLaunchTarget, setTargetLaunchTarget] = useState<AgentLaunchTarget | undefined>(() =>
    initialLaunchTarget(usableLaunchTargets, sourceLaunchTarget),
  );
  const [configValues, setConfigValues] = useState<ConfigOptionValues>(() => {
    const launchTarget = initialLaunchTarget(usableLaunchTargets, sourceLaunchTarget);
    return hardResetForAgent(launchTarget === undefined ? undefined : getConfigOptionIndex(launchTarget)).values;
  });

  const index = targetLaunchTarget === undefined ? undefined : getConfigOptionIndex(targetLaunchTarget);
  const selectedModelId = typeof configValues.model === 'string' ? configValues.model : index?.defaultModelId;
  const configOptions = optionsWithValues(rowForModel(index, selectedModelId), configValues);
  const partitioned = useMemo(() => partitionComposerConfigOptions(configOptions), [configOptions]);

  const canConfirm = targetLaunchTarget !== undefined && usableLaunchTargets.includes(targetLaunchTarget);

  const onConfigOptionChange = (diff: ConfigValueDiff) => {
    setConfigValues(current => {
      if (diff.type === 'boolean') {
        return { ...current, [diff.configId]: diff.value };
      }
      if (diff.configId !== 'model') {
        return { ...current, [diff.configId]: diff.value };
      }
      const nextRow = rowForModel(index, diff.value);
      return preserveConfigValuesOnModelChange({ ...current, model: diff.value }, nextRow);
    });
  };

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onCancel} open={open}>
      <DialogTitle>Handoff</DialogTitle>
      <DialogContent>
        <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          <SessionAgentChip
            interactive
            onChange={next => {
              setTargetLaunchTarget(next);
              setConfigValues(hardResetForAgent(getConfigOptionIndex(next)).values);
            }}
            usableLaunchTargets={usableLaunchTargets}
            selectableLaunchTargets={selectableLaunchTargets}
            unavailableReasons={unavailableReasons}
            value={targetLaunchTarget}
          />
          {partitioned.modelEffort !== undefined ? (
            <SessionModelEffortChip
              effort={partitioned.modelEffort.effort}
              model={partitioned.modelEffort.model}
              onChange={onConfigOptionChange}
              unavailableModelIds={index?.unavailableModelIds}
            />
          ) : null}
          {partitioned.mode !== undefined ? (
            <SessionAccessChip onChange={onConfigOptionChange} option={partitioned.mode} />
          ) : null}
          {partitioned.leftovers.map(option => (
            <SessionConfigOptionControl
              disabled={false}
              key={option.id}
              onChange={onConfigOptionChange}
              option={option}
              unavailableModelIds={index?.unavailableModelIds}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          disabled={!canConfirm}
          onClick={() => {
            if (targetLaunchTarget === undefined) {
              return;
            }
            onConfirm({ configValues, targetLaunchTarget });
          }}
          variant="contained"
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
};
