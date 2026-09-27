import { agentLaunchTargetLabel, configValuesFromOptions, preserveConfigValuesOnModelChange } from '@lib/ui';
import type { AgentLaunchTarget, ConfigOptionIndex, NormalizedConfigOption } from '@lib/ui';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import type { FC } from 'react';

import { SessionConfigOptionSelect } from '../shared/SessionConfigOptionSelect.tsx';

const optionsWithValues = (
  options: readonly NormalizedConfigOption[],
  values: Readonly<Record<string, string>>,
): readonly NormalizedConfigOption[] =>
  options.map(option => ({
    ...option,
    currentValue: values[option.id] ?? option.currentValue,
  }));

const rowForModel = (
  index: ConfigOptionIndex | undefined,
  modelId: string | undefined,
): readonly NormalizedConfigOption[] => {
  if (index === undefined || modelId === undefined) {
    return [];
  }
  return index.byModel[modelId] ?? [];
};

const hardResetForAgent = (
  index: ConfigOptionIndex | undefined,
): {
  readonly options: readonly NormalizedConfigOption[];
  readonly values: Readonly<Record<string, string>>;
} => {
  if (index === undefined) {
    return { options: [], values: {} };
  }
  const options = rowForModel(index, index.defaultModelId);
  return { options, values: configValuesFromOptions(options) };
};

const initialLaunchTarget = (
  readyLaunchTargets: readonly AgentLaunchTarget[],
  sourceLaunchTarget: AgentLaunchTarget,
): AgentLaunchTarget | undefined =>
  readyLaunchTargets.includes(sourceLaunchTarget) ? sourceLaunchTarget : readyLaunchTargets[0];

export const HandoffModal: FC<{
  readonly getConfigOptionIndex: (launchTarget: AgentLaunchTarget) => ConfigOptionIndex | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: (arg: {
    configValues: Readonly<Record<string, string>>;
    targetLaunchTarget: AgentLaunchTarget;
  }) => void;
  readonly open: boolean;
  readonly readyLaunchTargets: readonly AgentLaunchTarget[];
  readonly sourceLaunchTarget: AgentLaunchTarget;
}> = ({ getConfigOptionIndex, onCancel, onConfirm, open, readyLaunchTargets, sourceLaunchTarget }) => {
  const [targetLaunchTarget, setTargetLaunchTarget] = useState<AgentLaunchTarget | undefined>(() =>
    initialLaunchTarget(readyLaunchTargets, sourceLaunchTarget),
  );
  const [configValues, setConfigValues] = useState<Readonly<Record<string, string>>>(() => {
    const launchTarget = initialLaunchTarget(readyLaunchTargets, sourceLaunchTarget);
    return hardResetForAgent(launchTarget === undefined ? undefined : getConfigOptionIndex(launchTarget)).values;
  });

  const index = targetLaunchTarget === undefined ? undefined : getConfigOptionIndex(targetLaunchTarget);
  const selectedModelId = Object.hasOwn(configValues, 'model') ? configValues.model : index?.defaultModelId;
  const configOptions = optionsWithValues(rowForModel(index, selectedModelId), configValues);

  const canConfirm = targetLaunchTarget !== undefined && readyLaunchTargets.includes(targetLaunchTarget);

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onCancel} open={open}>
      <DialogTitle>Handoff</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="handoff-target-launch-target-label">Agent</InputLabel>
            <Select
              label="Agent"
              labelId="handoff-target-launch-target-label"
              onChange={event => {
                const next = event.target.value;
                setTargetLaunchTarget(next);
                setConfigValues(hardResetForAgent(getConfigOptionIndex(next)).values);
              }}
              value={targetLaunchTarget ?? ''}
            >
              {readyLaunchTargets.map(launchTarget => (
                <MenuItem key={launchTarget} value={launchTarget}>
                  {agentLaunchTargetLabel(launchTarget)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {configOptions.map(option => (
            <SessionConfigOptionSelect
              disabled={false}
              key={option.id}
              onChange={(configId, value) => {
                setConfigValues(current => {
                  if (configId !== 'model') {
                    return { ...current, [configId]: value };
                  }
                  const nextRow = rowForModel(index, value);
                  return preserveConfigValuesOnModelChange({ ...current, model: value }, nextRow);
                });
              }}
              option={option}
            />
          ))}
        </Stack>
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
