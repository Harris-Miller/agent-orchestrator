import { useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { FC } from 'react';

import {
  selectedActiveSubagentIdsAtom,
  selectedSessionLaunchTargetAtom,
  selectedSubagentAtom,
} from '../../atoms/backendState.atoms.ts';
import { canCancelSubagent, isWorking } from '../../host/subagent.ts';
import { SubagentRow } from './transcript/chatItems/SubagentRow.tsx';
import { useCancelSubagent } from './useCancelSubagent.ts';

const StripRow: FC<{ readonly childId: string; readonly onClientError: (error: unknown) => void }> = ({
  childId,
  onClientError,
}) => {
  const child = useAtomValue(selectedSubagentAtom(childId));
  const launchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const { cancel, cancelRequested } = useCancelSubagent(launchTarget, childId, onClientError);
  const cancellable = child !== undefined && launchTarget !== undefined && isWorking(child) && canCancelSubagent(child);
  return (
    <SubagentRow
      action={
        cancellable ? (
          <Button color="warning" disabled={cancelRequested} onClick={cancel} size="small">
            Cancel
          </Button>
        ) : undefined
      }
      childId={childId}
      showRollUp={false}
    />
  );
};

/** Always-visible list of the Selected session's active Subagents, outside any Work region. */
export const ActiveSubagentsStrip: FC<{ readonly onClientError: (error: unknown) => void }> = ({ onClientError }) => {
  const ids = useAtomValue(selectedActiveSubagentIdsAtom);
  return ids.length === 0 ? null : (
    <Box aria-label="Active subagents" role="region" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {ids.map(id => (
        <StripRow childId={id} key={id} onClientError={onClientError} />
      ))}
    </Box>
  );
};
