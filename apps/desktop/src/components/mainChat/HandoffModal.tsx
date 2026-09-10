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

import type { NormalizedConfigOption } from '../../acp/acpSessionBootstrap.ts';
import { agentLaunchTargetLabel } from '../../acp/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../../acp/agentLaunchTarget.ts';
import type { ProviderConfigStored } from '../../acp/providerConfigStorage.ts';
import { SessionConfigOptionSelect } from '../shared/SessionConfigOptionSelect.tsx';

const catalogOptions = (stored: ProviderConfigStored | undefined): readonly NormalizedConfigOption[] => {
  if (stored === undefined) {
    return [];
  }
  return stored.catalog.map(entry => ({
    category: entry.category,
    choices: entry.choices,
    currentValue: stored.defaults[entry.id] ?? entry.choices[0]?.id,
    description: entry.description,
    id: entry.id,
    name: entry.name,
  }));
};

const valuesFromOptions = (options: readonly NormalizedConfigOption[]): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const option of options) {
    if (option.currentValue !== undefined) {
      values[option.id] = option.currentValue;
    }
  }
  return values;
};

const initialLaunchTarget = (
  readyLaunchTargets: readonly AgentLaunchTarget[],
  sourceLaunchTarget: AgentLaunchTarget,
): AgentLaunchTarget | undefined =>
  readyLaunchTargets.includes(sourceLaunchTarget) ? sourceLaunchTarget : readyLaunchTargets[0];

export const HandoffModal: FC<{
  readonly getProviderConfig: (launchTarget: AgentLaunchTarget) => ProviderConfigStored | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: (arg: {
    configValues: Readonly<Record<string, string>>;
    targetLaunchTarget: AgentLaunchTarget;
  }) => void;
  readonly open: boolean;
  readonly readyLaunchTargets: readonly AgentLaunchTarget[];
  readonly sourceLaunchTarget: AgentLaunchTarget;
}> = ({ getProviderConfig, onCancel, onConfirm, open, readyLaunchTargets, sourceLaunchTarget }) => {
  const [targetLaunchTarget, setTargetLaunchTarget] = useState<AgentLaunchTarget | undefined>(() =>
    initialLaunchTarget(readyLaunchTargets, sourceLaunchTarget),
  );
  const [configOptions, setConfigOptions] = useState<readonly NormalizedConfigOption[]>(() => {
    const launchTarget = initialLaunchTarget(readyLaunchTargets, sourceLaunchTarget);
    return catalogOptions(launchTarget === undefined ? undefined : getProviderConfig(launchTarget));
  });

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
                setConfigOptions(catalogOptions(getProviderConfig(next)));
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
                setConfigOptions(current =>
                  current.map(entry => (entry.id === configId ? { ...entry, currentValue: value } : entry)),
                );
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
            onConfirm({ configValues: valuesFromOptions(configOptions), targetLaunchTarget });
          }}
          variant="contained"
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
};
