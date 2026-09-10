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

import { agentLaunchTargetLabel } from '../../acp/acpSessionBootstrap.ts';
import type { NormalizedConfigOption } from '../../acp/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../acp/agentHarness.ts';
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

const initialBackend = (
  readyBackends: readonly AgentLaunchTarget[],
  sourceBackend: AgentLaunchTarget,
): AgentLaunchTarget | undefined => (readyBackends.includes(sourceBackend) ? sourceBackend : readyBackends[0]);

export const HandoffModal: FC<{
  readonly getProviderConfig: (backend: AgentLaunchTarget) => ProviderConfigStored | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: (arg: {
    configValues: Readonly<Record<string, string>>;
    targetBackend: AgentLaunchTarget;
  }) => void;
  readonly open: boolean;
  readonly readyBackends: readonly AgentLaunchTarget[];
  readonly sourceBackend: AgentLaunchTarget;
}> = ({ getProviderConfig, onCancel, onConfirm, open, readyBackends, sourceBackend }) => {
  const [targetBackend, setTargetBackend] = useState<AgentLaunchTarget | undefined>(() =>
    initialBackend(readyBackends, sourceBackend),
  );
  const [configOptions, setConfigOptions] = useState<readonly NormalizedConfigOption[]>(() => {
    const backend = initialBackend(readyBackends, sourceBackend);
    return catalogOptions(backend === undefined ? undefined : getProviderConfig(backend));
  });

  const canConfirm = targetBackend !== undefined && readyBackends.includes(targetBackend);

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onCancel} open={open}>
      <DialogTitle>Handoff</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="handoff-target-backend-label">Agent</InputLabel>
            <Select
              label="Agent"
              labelId="handoff-target-backend-label"
              onChange={event => {
                const next = event.target.value;
                setTargetBackend(next);
                setConfigOptions(catalogOptions(getProviderConfig(next)));
              }}
              value={targetBackend ?? ''}
            >
              {readyBackends.map(backend => (
                <MenuItem key={backend} value={backend}>
                  {agentLaunchTargetLabel(backend)}
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
            if (targetBackend === undefined) {
              return;
            }
            onConfirm({ configValues: valuesFromOptions(configOptions), targetBackend });
          }}
          variant="contained"
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
};
