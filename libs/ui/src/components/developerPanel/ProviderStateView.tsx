import { useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { allInitializeResultsAtom, allLaunchTargetPhasesAtom } from '../../atoms/backendState.atoms.ts';
import type { NormalizedCapability, NormalizedInitializeState } from '../../host/acpSessionBootstrap.ts';
import { normalizeInitialize } from '../../host/acpSessionBootstrap.ts';
import { FONT_FAMILY_MONO } from '../../theme/tokens.ts';
import { ProviderPhaseStatus } from '../ProviderPhaseStatus.tsx';

import { Section, sectionCardSx } from './SessionStateView.tsx';

const capabilityGroupLabel = (path: string): string => {
  const [group] = path.split('.');
  switch (group) {
    case 'auth':
      return 'Auth';
    case 'mcpCapabilities':
      return 'MCP';
    case 'promptCapabilities':
      return 'Prompt';
    case 'sessionCapabilities':
      return 'Session';
    default:
      return 'General';
  }
};

const groupCapabilities = (
  capabilities: readonly NormalizedCapability[],
): readonly { readonly group: string; readonly items: readonly NormalizedCapability[] }[] => {
  const groups = new Map<string, NormalizedCapability[]>();

  for (const capability of capabilities) {
    const group = capabilityGroupLabel(capability.path);
    const existing = groups.get(group) ?? [];
    existing.push(capability);
    groups.set(group, existing);
  }

  return [...groups.entries()].map(([group, items]) => ({ group, items }));
};

const capabilityLabel = (path: string): string => path.split('.').at(-1) ?? path;

const ProviderStateSection: FC<{ readonly initialize: NormalizedInitializeState }> = ({ initialize }) => {
  const capabilityGroups = groupCapabilities(initialize.capabilities);

  return (
    <Stack spacing={2}>
      <Section title="Agent">
        <Stack spacing={1.5}>
          {initialize.agentInfo !== undefined ? (
            <Paper sx={sectionCardSx} variant="outlined">
              <Stack spacing={0.5}>
                <Typography sx={{ fontWeight: 600 }} variant="body1">
                  {initialize.agentInfo.title ?? initialize.agentInfo.name}
                </Typography>
                <Typography color="text.secondary" sx={{ fontFamily: FONT_FAMILY_MONO }} variant="caption">
                  {initialize.agentInfo.name} · v{initialize.agentInfo.version}
                </Typography>
              </Stack>
            </Paper>
          ) : null}

          {initialize.authMethods.length > 0 ? (
            <Stack spacing={0.75}>
              <Typography color="text.secondary" variant="caption">
                Auth methods
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {initialize.authMethods.map(method => (
                  <Chip key={method.id} label={method.name ?? method.id} size="small" variant="outlined" />
                ))}
              </Stack>
            </Stack>
          ) : null}

          {initialize.metaExtensions.length > 0 ? (
            <Stack spacing={0.75}>
              <Typography color="text.secondary" variant="caption">
                Extensions
              </Typography>
              {initialize.metaExtensions.map(extension => (
                <Box key={extension.key}>
                  <Typography sx={{ fontWeight: 600 }} variant="body2">
                    {extension.key}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    {extension.summary}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </Section>

      <Divider />

      <Section title="Capabilities">
        {capabilityGroups.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            None reported
          </Typography>
        ) : (
          <Stack spacing={1.25}>
            {capabilityGroups.map(group => (
              <Box key={group.group}>
                <Typography color="text.secondary" sx={{ mb: 0.75 }} variant="caption">
                  {group.group}
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  {group.items.map(capability => (
                    <Chip
                      color={capability.enabled ? 'success' : 'default'}
                      key={capability.path}
                      label={capabilityLabel(capability.path)}
                      size="small"
                      title={capability.path}
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
};

/** Provider State body for the Developer panel tab: every provider, with its Settings → Providers status and initialize details once available. */
export const ProviderStateView: FC = () => {
  const phases = useAtomValue(allLaunchTargetPhasesAtom);
  const results = useAtomValue(allInitializeResultsAtom);

  return (
    <Stack divider={<Divider />} spacing={2}>
      {phases.map(entry => {
        const initialize = normalizeInitialize(
          results.find(result => result.launchTarget === entry.launchTarget)?.initializeResult,
        );
        return (
          <Stack key={entry.launchTarget} spacing={1.5}>
            <ProviderPhaseStatus entry={entry} />
            {initialize === undefined ? null : <ProviderStateSection initialize={initialize} />}
          </Stack>
        );
      })}
    </Stack>
  );
};
