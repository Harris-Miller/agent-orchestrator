import { useAtomMount, useAtomValue } from '@effect/atom-react';
import AlertTitle from '@mui/material/AlertTitle';
import { useState } from 'react';
import type { FC } from 'react';

import { hubAtom } from '../atoms/boundHarnessAtoms.ts';
import { hubAvailabilityAtom } from '../atoms/hub.atoms.ts';
import { appOrchestratedAgentsEnabledAtom } from '../atoms/userSettings/userSettingsDocument.atoms.ts';
import { Toast } from './Toast.tsx';

/**
 * Connects to the MCP hub for the app's lifetime (while Experimental: App Orchestrated Agents is on); shows the
 * degraded-mode notice while it is unavailable. The user can dismiss the notice; it comes back when the reason changes, and goes away by itself once the hub is reachable.
 */
export const HubMount: FC = () => {
  useAtomMount(hubAtom);
  const availability = useAtomValue(hubAvailabilityAtom);
  const enabled = useAtomValue(appOrchestratedAgentsEnabledAtom);
  const [dismissed, setDismissed] = useState<string | undefined>(undefined);
  const reason = enabled && availability._tag === 'unavailable' ? availability.reason : undefined;
  return (
    <Toast
      onClose={() => {
        setDismissed(reason);
      }}
      open={reason !== undefined && reason !== dismissed}
      severity="info"
    >
      <AlertTitle>Not all features are available</AlertTitle>
      Handoff is unavailable. {reason}
    </Toast>
  );
};
