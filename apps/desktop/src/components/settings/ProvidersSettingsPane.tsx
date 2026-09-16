import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import type { AcpBootstrapPhase } from '../../acp/acpSessionBootstrap.ts';
import { allLaunchTargetPhasesAtom, restartBackendAtomFn } from '../../atoms/index.ts';

const phaseColor = (phase: AcpBootstrapPhase): 'default' | 'error' | 'success' | 'warning' => {
  switch (phase) {
    case 'connecting':
    case 'initialized':
      return 'warning';
    case 'error':
      return 'error';
    case 'ready':
      return 'success';
    default:
      return 'default';
  }
};

/** Settings → Providers: harness phase chips + Gemini coming soon. */
export const ProvidersSettingsPane: FC = () => {
  const backendPhases = useAtomValue(allLaunchTargetPhasesAtom);
  const restartBackend = useAtomSet(restartBackendAtomFn, { mode: 'promise' });

  return (
    <>
      <Typography variant="h6">Providers</Typography>
      <Typography color="text.secondary" sx={{ mb: 2, mt: 1 }} variant="body2">
        Bootstrap phase per provider. Click an error chip to retry that provider.
      </Typography>
      <Stack spacing={2}>
        {backendPhases.map(entry => (
          <Box key={entry.launchTarget}>
            <Chip
              color={phaseColor(entry.phase)}
              label={`${entry.label}: ${entry.phase}`}
              onClick={
                entry.phase === 'error'
                  ? () => {
                      restartBackend(entry.launchTarget).catch(() => undefined);
                    }
                  : undefined
              }
              size="small"
              sx={{ cursor: entry.phase === 'error' ? 'pointer' : 'default' }}
              variant="outlined"
            />
            {entry.phase === 'error' && entry.error !== undefined ? (
              <Typography color="text.secondary" sx={{ mt: 0.75 }} variant="body2">
                {entry.error}
              </Typography>
            ) : null}
          </Box>
        ))}
        <Box>
          <Chip color="default" label="Gemini: coming soon" size="small" variant="outlined" />
          <Typography color="text.secondary" sx={{ mt: 0.75 }} variant="body2">
            Gemini support is not available yet.
          </Typography>
        </Box>
      </Stack>
    </>
  );
};
