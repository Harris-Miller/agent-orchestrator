import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useState } from 'react';
import type { FC } from 'react';

import {
  selectedActiveSubagentIdsAtom,
  selectedSessionLaunchTargetAtom,
  selectedSubagentAtom,
} from '../../atoms/backendState.atoms.ts';
import { cancelSubagentAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { canCancelSubagent, isWorking } from '../../host/subagent.ts';
import { SubagentRow } from './transcript/chatItems/SubagentItemView.tsx';

const StripRow: FC<{ readonly childId: string; readonly onClientError: (error: unknown) => void }> = ({
  childId,
  onClientError,
}) => {
  const [cancelRequested, setCancelRequested] = useState(false);
  const child = useAtomValue(selectedSubagentAtom(childId));
  const launchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const cancel = useAtomSet(cancelSubagentAtomFn, { mode: 'promise' });
  const cancellable = child !== undefined && launchTarget !== undefined && isWorking(child) && canCancelSubagent(child);
  return (
    <SubagentRow
      action={
        cancellable ? (
          <Button
            color="warning"
            disabled={cancelRequested}
            onClick={() => {
              setCancelRequested(true);
              cancel({ launchTarget, sessionId: childId }).catch((error: unknown) => {
                setCancelRequested(false);
                onClientError(error);
              });
            }}
            size="small"
          >
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
