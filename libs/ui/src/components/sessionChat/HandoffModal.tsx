import { useMemo, useState } from 'react';
import type { FC } from 'react';

import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { hardResetForAgent, optionsWithValues, rowForModel } from '../../host/configOptionIndexUi.ts';
import { preserveConfigValuesOnModelChange } from '../../host/configProbe.ts';
import type { ConfigOptionIndex, ConfigOptionValues } from '../../host/configProbe.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog.tsx';

import { partitionComposerConfigOptions } from './partitionComposerConfigOptions.ts';
import { SessionAccessChip } from './SessionAccessChip.tsx';
import { SessionAgentChip } from './SessionAgentChip.tsx';
import { SessionConfigOptionControl } from './SessionConfigOptionControl.tsx';
import { SessionModelEffortChip } from './SessionModelEffortChip.tsx';

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
  const partitioned = useMemo(() => partitionComposerConfigOptions(configOptions), [configOptions]);

  const canConfirm = targetLaunchTarget !== undefined && readyLaunchTargets.includes(targetLaunchTarget);

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
    <Dialog
      onOpenChange={next => {
        if (!next) {
          onCancel();
        }
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Handoff</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1">
          <SessionAgentChip
            interactive
            onChange={next => {
              setTargetLaunchTarget(next);
              setConfigValues(hardResetForAgent(getConfigOptionIndex(next)).values);
            }}
            readyLaunchTargets={readyLaunchTargets}
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
        </div>
        <DialogFooter>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() => {
              if (targetLaunchTarget === undefined) {
                return;
              }
              onConfirm({ configValues, targetLaunchTarget });
            }}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
