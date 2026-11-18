import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { RegistryContext } from '@effect/atom-react';
import { useContext, useState } from 'react';
import type { FC } from 'react';

import { modelPickerPrefsAtom } from '../../../atoms/userSettings/userSettingsDocument.atoms.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import {
  hardResetForAgent,
  optionsWithValues,
  rowForModel,
  startingModelId,
} from '../../../host/configOptionIndexUi.ts';
import { preserveConfigValuesOnModelChange } from '../../../host/configProbe.ts';
import type { ConfigOptionIndex, ConfigOptionValues } from '../../../host/configProbe.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import { ConfigChipRow } from '../configChips/ConfigChipRow.tsx';

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
  const registry = useContext(RegistryContext);
  const [targetLaunchTarget, setTargetLaunchTarget] = useState<AgentLaunchTarget | undefined>(() =>
    initialLaunchTarget(usableLaunchTargets, sourceLaunchTarget),
  );
  const [configValues, setConfigValues] = useState<ConfigOptionValues>(() => {
    const launchTarget = initialLaunchTarget(usableLaunchTargets, sourceLaunchTarget);
    return hardResetForAgent(
      launchTarget === undefined ? undefined : getConfigOptionIndex(launchTarget),
      registry.get(modelPickerPrefsAtom(launchTarget)),
    ).values;
  });

  const index = targetLaunchTarget === undefined ? undefined : getConfigOptionIndex(targetLaunchTarget);
  const selectedModelId =
    typeof configValues.model === 'string'
      ? configValues.model
      : index && startingModelId(index, registry.get(modelPickerPrefsAtom(targetLaunchTarget)));
  const configOptions = optionsWithValues(rowForModel(index, selectedModelId), configValues);

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
          <ConfigChipRow
            agent={{
              disabled: false,
              interactive: true,
              onChange: next => {
                setTargetLaunchTarget(next);
                setConfigValues(
                  hardResetForAgent(getConfigOptionIndex(next), registry.get(modelPickerPrefsAtom(next))).values,
                );
              },
              selectableLaunchTargets,
              unavailableReasons,
              usableLaunchTargets,
              value: targetLaunchTarget,
            }}
            configDisabled={false}
            configOptions={configOptions}
            onConfigChange={onConfigOptionChange}
            unavailableModelIds={index?.unavailableModelIds}
          />
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
