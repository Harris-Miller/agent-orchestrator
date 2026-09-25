import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { agentLaunchTargetLabel, ALL_AGENT_LAUNCH_TARGETS } from '../../acp/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../../acp/agentLaunchTarget.ts';
import type { ProviderConfigCatalogEntry } from '../../acp/providerConfigStorage.ts';
import { providerConfigAtom, setHarnessConfigDefaultsAtomFn, userSettingsAtom } from '../../atoms/index.ts';
import { SessionConfigOptionSelect } from '../shared/SessionConfigOptionSelect.tsx';

const catalogEntryToOption = (entry: ProviderConfigCatalogEntry, defaults: Readonly<Record<string, string>>) => ({
  choices: entry.choices,
  currentValue: defaults[entry.id] ?? entry.choices[0]?.id,
  id: entry.id,
  name: entry.name,
  type: 'select' as const,
  ...(entry.category !== undefined ? { category: entry.category } : {}),
  ...(entry.description !== undefined ? { description: entry.description } : {}),
});

const LaunchTargetDefaults: FC<{ readonly launchTarget: AgentLaunchTarget }> = ({ launchTarget }) => {
  const settings = useAtomValue(userSettingsAtom);
  const providerConfig = useAtomValue(providerConfigAtom(launchTarget));
  const setHarnessConfigDefaults = useAtomSet(setHarnessConfigDefaultsAtomFn, { mode: 'promise' });
  const defaults = settings.harnessConfigDefaults?.[launchTarget] ?? {};
  const catalog = providerConfig?.catalog ?? [];

  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={{ mb: 1 }} variant="subtitle1">
        {agentLaunchTargetLabel(launchTarget)}
      </Typography>
      {catalog.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          Open a session once to populate selectable options for this agent.
        </Typography>
      ) : (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
          {catalog.map(entry => (
            <SessionConfigOptionSelect
              disabled={false}
              key={entry.id}
              onChange={(configId, value) => {
                setHarnessConfigDefaults({ configId, launchTarget, value }).catch(() => undefined);
              }}
              option={catalogEntryToOption(entry, defaults)}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
};

/** Live-write editors for per–launch-target harness config defaults. */
export const HarnessDefaultsSettingsPane: FC = () => (
  <>
    <Typography variant="h6">Harness defaults</Typography>
    <Typography color="text.secondary" sx={{ mb: 2, mt: 1 }} variant="body2">
      Preferred config option values applied when creating or handing off sessions. Changes save immediately to the
      Settings document.
    </Typography>
    {ALL_AGENT_LAUNCH_TARGETS.map(launchTarget => (
      <LaunchTargetDefaults key={launchTarget} launchTarget={launchTarget} />
    ))}
  </>
);
