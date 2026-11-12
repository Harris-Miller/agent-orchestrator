import { useAtomMount, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Snackbar from '@mui/material/Snackbar';
import { useState } from 'react';
import type { FC } from 'react';

import { hubAtom } from '../atoms/boundHarnessAtoms.ts';
import { hubAvailabilityAtom } from '../atoms/hub.atoms.ts';

/**
 * Connects to the MCP hub for the app's lifetime; shows the degraded-mode notice while it is unavailable. The user can
 * dismiss the notice; it comes back when the reason changes, and goes away by itself once the hub is reachable.
 */
export const HubMount: FC = () => {
  useAtomMount(hubAtom);
  const availability = useAtomValue(hubAvailabilityAtom);
  const [dismissed, setDismissed] = useState<string | undefined>(undefined);
  const reason = availability._tag === 'unavailable' ? availability.reason : undefined;
  return (
    <Snackbar
      anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
      open={reason !== undefined && reason !== dismissed}
    >
      <Alert onClose={() => setDismissed(reason)} severity="info" variant="filled">
        <AlertTitle>Not all features are available</AlertTitle>
        Handoff is unavailable. {reason}
      </Alert>
    </Snackbar>
  );
};
