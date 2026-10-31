import { useAtomValue } from '@effect/atom-react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { allLaunchTargetPhasesAtom } from '../atoms/backendState.atoms.ts';

import { ProviderPhaseStatus } from './ProviderPhaseStatus.tsx';

/** Settings → Providers: harness phase chips. */
export const ProvidersSettingsPane: FC = () => {
  const backendPhases = useAtomValue(allLaunchTargetPhasesAtom);

  return (
    <>
      <Typography variant="h6">Providers</Typography>
      <Typography color="text.secondary" sx={{ mb: 2, mt: 1 }} variant="body2">
        Bootstrap phase per provider. Click an error chip to retry that provider.
      </Typography>
      <Stack spacing={2}>
        {backendPhases.map(entry => (
          <ProviderPhaseStatus entry={entry} key={entry.launchTarget} />
        ))}
      </Stack>
    </>
  );
};
