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

import { agentLaunchTargetLabel } from '../../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { hardResetForAgent, optionsWithValues, rowForModel } from '../../host/configOptionIndexUi.ts';
import { preserveConfigValuesOnModelChange } from '../../host/configProbe.ts';
import type { ConfigOptionIndex, ConfigOptionValues } from '../../host/configProbe.ts';

import { SessionConfigOptionControl } from './SessionConfigOptionControl.tsx';

const initialLaunchTarget = (
  readyLaunchTargets: readonly AgentLaunchTarget[],
  sourceLaunchTarget: AgentLaunchTarget,
): AgentLaunchTarget | undefined =>
  readyLaunchTargets.includes(sourceLaunchTarget) ? sourceLaunchTarget : readyLaunchTargets[0];

export const HandoffModal: FC<{
  readonly getConfigOptionIndex: (launchTarget: AgentLaunchTarget) => ConfigOptionIndex | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: (arg: { configValues: ConfigOptionValues; targetLaunchTarget: AgentLaunchTarget }) => void;
  readonly open: boolean;
  readonly readyLaunchTargets: readonly AgentLaunchTarget[];
  readonly sourceLaunchTarget: AgentLaunchTarget;
}> = ({ getConfigOptionIndex, onCancel, onConfirm, open, readyLaunchTargets, sourceLaunchTarget }) => {
  const [targetLaunchTarget, setTargetLaunchTarget] = useState<AgentLaunchTarget | undefined>(() =>
    initialLaunchTarget(readyLaunchTargets, sourceLaunchTarget),
  );
  const [configValues, setConfigValues] = useState<ConfigOptionValues>(() => {
    const launchTarget = initialLaunchTarget(readyLaunchTargets, sourceLaunchTarget);
    return hardResetForAgent(launchTarget === undefined ? undefined : getConfigOptionIndex(launchTarget)).values;
  });

  const index = targetLaunchTarget === undefined ? undefined : getConfigOptionIndex(targetLaunchTarget);
  const selectedModelId = typeof configValues.model === 'string' ? configValues.model : index?.defaultModelId;
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
            <SessionConfigOptionControl
              disabled={false}
              key={option.id}
              onChange={diff => {
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
              }}
              option={option}
              unavailableModelIds={index?.unavailableModelIds}
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
