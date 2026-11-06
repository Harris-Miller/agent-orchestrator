import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { backendHarnessStateAtom, viewedSubagentAtom } from '../../atoms/backendState.atoms.ts';
import {
  cancelSubagentAtomFn,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import { canCancelSubagent, getSubagent, isSubagentFinished, isSubagentTerminal } from '../../host/subagent.ts';

import { ChatItemView } from './ChatItemView.tsx';
import { PendingElicitationCard } from './PendingElicitationCard.tsx';
import { PendingPermissionCard } from './PendingPermissionCard.tsx';
import { SubagentStatusIndicator } from './SubagentStatusIndicator.tsx';

/** Read-only full-pane view of one subagent child: header, task, transcript, approval card. No composer. */
export const SubagentView: FC<{ readonly onClientError: (error: unknown) => void }> = ({ onClientError }) => {
  const viewed = useAtomValue(viewedSubagentAtom);
  const setViewed = useAtomSet(viewedSubagentAtom);
  const snapshot = useAtomValue(backendHarnessStateAtom(viewed?.launchTarget ?? 'codex-acp'));
  const cancel = useAtomSet(cancelSubagentAtomFn, { mode: 'promise' });
  const respondPermission = useAtomSet(respondPermissionAtomFn, { mode: 'promise' });
  const respondElicitation = useAtomSet(respondElicitationAtomFn, { mode: 'promise' });
  const child = viewed === undefined ? undefined : getSubagent(snapshot.subagents, viewed.childId);
  if (viewed === undefined || child === undefined) return null;
  const parentId = child.parentSessionId;
  const parent = getSubagent(snapshot.subagents, parentId);
  const running =
    child.state === undefined
      ? child.stateUnconfirmed !== true
      : !isSubagentTerminal(child.state) && !isSubagentFinished(child.state);
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
        <SubagentStatusIndicator child={child} />
        <Typography sx={{ fontWeight: 600 }}>{child.name ?? 'Subagent'}</Typography>
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
        <Typography
          color="text.secondary"
          sx={{ maxHeight: '4.5em', overflowY: 'auto', px: 1.5, whiteSpace: 'pre-wrap' }}
          variant="body2"
        >
          {child.task}
        </Typography>
      )}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 0.5 }}>
        <List dense disablePadding>
          {child.transcript.items
            .filter(item => item.kind !== 'config_options')
            .map(item => (
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
      {child.pendingElicitation === undefined ? null : (
        <Box sx={{ maxHeight: '40%', overflowY: 'auto', px: 1, py: 0.5 }}>
          <PendingElicitationCard
            agentTitle={child.name ?? 'Subagent'}
            key={child.pendingElicitation.id}
            onAccept={(content, summary) => {
              respondElicitation({
                launchTarget: viewed.launchTarget,
                response: { action: 'accept', content },
                sessionId: child.sessionId,
                summary,
              }).catch(onClientError);
            }}
            onCancel={() => {
              respondElicitation({
                launchTarget: viewed.launchTarget,
                response: { action: 'cancel' },
                sessionId: child.sessionId,
              }).catch(onClientError);
            }}
            onDecline={() => {
              respondElicitation({
                launchTarget: viewed.launchTarget,
                response: { action: 'decline' },
                sessionId: child.sessionId,
              }).catch(onClientError);
            }}
            request={child.pendingElicitation.request}
          />
        </Box>
      )}
      <Alert severity="info" sx={{ m: 1 }}>
        Subagent session — read-only.
      </Alert>
    </Box>
  );
};
