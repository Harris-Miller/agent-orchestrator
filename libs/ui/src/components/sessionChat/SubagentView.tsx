import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { backendHarnessStateAtom, viewedSubagentAtom } from '../../atoms/backendState.atoms.ts';
import { cancelSubagentAtomFn, respondPermissionAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { canCancelSubagent, getSubagent, isSubagentFinished } from '../../host/subagent.ts';

import { ChatItemView } from './ChatItemView.tsx';
import { PendingPermissionCard } from './PendingPermissionCard.tsx';
import { subagentStateLabel } from './SubagentRows.tsx';

/** Read-only full-pane view of one subagent child: header, task, transcript, approval card. No composer. */
export const SubagentView: FC<{ readonly onClientError: (error: unknown) => void }> = ({ onClientError }) => {
  const viewed = useAtomValue(viewedSubagentAtom);
  const setViewed = useAtomSet(viewedSubagentAtom);
  const snapshot = useAtomValue(backendHarnessStateAtom(viewed?.launchTarget ?? 'codex-acp'));
  const cancel = useAtomSet(cancelSubagentAtomFn, { mode: 'promise' });
  const respondPermission = useAtomSet(respondPermissionAtomFn, { mode: 'promise' });
  const child = viewed === undefined ? undefined : getSubagent(snapshot.subagents, viewed.childId);
  if (viewed === undefined || child === undefined) return null;
  const chip = subagentStateLabel(child);
  const parentId = child.parentSessionId;
  const parent = getSubagent(snapshot.subagents, parentId);
  const running = child.state !== undefined && !isSubagentFinished(child.state);
  return (
    <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ alignItems: 'center', display: 'flex', gap: 1, p: 1 }}>
        <Button
          onClick={() => {
            setViewed(parent === undefined ? undefined : { ...viewed, childId: parentId });
          }}
          size="small"
        >
          ← {parent?.name ?? 'Back'}
        </Button>
        <Typography sx={{ fontWeight: 600 }}>{child.name ?? 'Subagent'}</Typography>
        <Chip color={chip.color} label={chip.label} size="small" variant="outlined" />
        {running && canCancelSubagent(child) ? (
          <Button
            color="warning"
            onClick={() => {
              cancel({ launchTarget: viewed.launchTarget, sessionId: child.sessionId }).catch(onClientError);
            }}
            size="small"
          >
            Cancel
          </Button>
        ) : null}
      </Box>
      {child.task === undefined ? null : (
        <Typography color="text.secondary" sx={{ px: 1.5 }} variant="body2">
          {child.task}
        </Typography>
      )}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 0.5 }}>
        <List dense disablePadding>
          {child.transcript.items.map(item => (
            <ChatItemView item={item} key={item.id} />
          ))}
          {child.pendingPermission === undefined ? null : (
            <ListItem sx={{ display: 'block' }}>
              <PendingPermissionCard
                agentTitle={child.name ?? 'Subagent'}
                onSelect={optionId => {
                  respondPermission({
                    launchTarget: viewed.launchTarget,
                    optionId,
                    sessionId: child.sessionId,
                  }).catch(onClientError);
                }}
                request={child.pendingPermission.request}
              />
            </ListItem>
          )}
        </List>
      </Box>
      <Alert severity="info" sx={{ m: 1 }}>
        Subagent session — read-only.
      </Alert>
    </Box>
  );
};
