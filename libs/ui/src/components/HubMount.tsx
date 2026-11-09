import { useAtomMount, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import type { FC } from 'react';

import { hubAtom } from '../atoms/boundHarnessAtoms.ts';
import { hubAvailabilityAtom } from '../atoms/hub.atoms.ts';

/** Connects to the MCP hub for the app's lifetime; shows the degraded-mode notice while it is unavailable. */
export const HubMount: FC = () => {
  useAtomMount(hubAtom);
  const availability = useAtomValue(hubAvailabilityAtom);
  return (
    <Snackbar anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }} open={availability._tag === 'unavailable'}>
      <Alert severity="info" variant="filled">
        Not all features are available. {availability._tag === 'unavailable' ? availability.reason : ''} Handoff is
        disabled.
      </Alert>
    </Snackbar>
  );
};
