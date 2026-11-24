import { useAtomValue } from '@effect/atom-react';
import Button from '@mui/material/Button';
import ListItem from '@mui/material/ListItem';
import type { FC } from 'react';

import { selectedSessionLaunchTargetAtom, selectedSubagentAtom } from '../../../../atoms/backendState.atoms.ts';
import { canCancelSubagent, isWorking } from '../../../../host/subagent.ts';
import { useCancelSubagent } from '../../useCancelSubagent.ts';
import { useSessionChatSurface } from '../../useSessionChatSurface.tsx';
import type { ChatItemOf } from './chatItemOf.ts';
import { SubagentRow } from './SubagentRow.tsx';

/** A subagent Chat item in the parent transcript. */
export const SubagentItemView: FC<{ readonly item: ChatItemOf<'subagent'> }> = ({ item }) => {
  const childId = item.subagentSessionId;
  const child = useAtomValue(selectedSubagentAtom(childId));
  const launchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const { onClientError } = useSessionChatSurface();
  const { cancel, cancelRequested } = useCancelSubagent(launchTarget, childId, onClientError);
  const cancellable = child !== undefined && launchTarget !== undefined && isWorking(child) && canCancelSubagent(child);
  return (
    <ListItem sx={{ display: 'block', py: 0.25 }}>
      <SubagentRow
        action={
          cancellable ? (
            <Button color="warning" disabled={cancelRequested} onClick={cancel} size="small">
              Cancel
            </Button>
          ) : undefined
        }
        childId={childId}
      />
    </ListItem>
  );
};
