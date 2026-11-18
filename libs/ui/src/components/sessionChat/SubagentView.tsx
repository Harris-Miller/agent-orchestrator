import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC } from 'react';

import type { ElicitationReply } from '../../atoms/chat.atoms.ts';
import {
  backendHarnessSnapshotAtom,
  configOptionIndexByLaunchTargetAtom,
  viewedSubagentAtom,
} from '../../atoms/backendState.atoms.ts';
import {
  cancelSubagentAtomFn,
  chatWidthAtom,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import type { SessionConfiguration } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { canCancelSubagent, getSubagent, subagentTranscriptItems } from '../../host/subagent.ts';

import { chatWidthSx } from './chatWidth.ts';
import { SubagentDock } from './SubagentDock.tsx';
import { ChatItemView } from './transcript/ChatItemView.tsx';
import { PendingElicitationCard } from './pendingInteractions/PendingElicitationCard.tsx';
import { PendingPermissionCard } from './pendingInteractions/PendingPermissionCard.tsx';
import { SubagentStatusIndicator } from './transcript/chatItems/SubagentStatusIndicator.tsx';
import { SubagentTaskView } from './transcript/chatItems/SubagentTaskView.tsx';
import { subagentStatus } from './transcript/chatItems/subagentStateLabel.ts';

/** Stable empty configuration: Native subagents report none. */
const EMPTY_CONFIGURATION: SessionConfiguration = [];

const SubagentViewBody: FC<{
  readonly onClientError: (error: unknown) => void;
  readonly viewed: {
    readonly childId: string;
    readonly launchTarget: AgentLaunchTarget;
    readonly rootSessionId: string;
  };
}> = ({ onClientError, viewed }) => {
  const [cancelRequested, setCancelRequested] = useState(false);
  const setViewed = useAtomSet(viewedSubagentAtom);
  const snapshot = useAtomValue(backendHarnessSnapshotAtom(viewed.launchTarget));
  const configOptionIndexes = useAtomValue(configOptionIndexByLaunchTargetAtom);
  const chatWidth = useAtomValue(chatWidthAtom);
  const cancel = useAtomSet(cancelSubagentAtomFn, { mode: 'promise' });
  const respondPermission = useAtomSet(respondPermissionAtomFn, { mode: 'promise' });
  const respondElicitation = useAtomSet(respondElicitationAtomFn, { mode: 'promise' });
  const child = getSubagent(snapshot.subagents, viewed.childId);
  // A Spawned subagent session's Pending interactions live on its own launch target; answering there clears the mirror.
  const childLaunchTarget = child?.kind === 'spawned' ? child.launchTarget : viewed.launchTarget;
  // Hook must run before the `child === undefined` early return (rules of hooks).
  const childSnapshot = useAtomValue(backendHarnessSnapshotAtom(childLaunchTarget));
  if (child === undefined) return null;
  const parentId = child.parentSessionId;
  const parent = getSubagent(snapshot.subagents, parentId);
  const status = subagentStatus(child);
  const running = status === 'running' || status === 'needs_input';
  const configOptions =
    child.kind === 'spawned'
      ? (childSnapshot.sessions[child.sessionId]?.configuration ?? EMPTY_CONFIGURATION)
      : EMPTY_CONFIGURATION;
  const respond = (reply: ElicitationReply) => {
    respondElicitation({ launchTarget: childLaunchTarget, sessionId: child.sessionId, ...reply }).catch(onClientError);
  };
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
            disabled={cancelRequested}
            onClick={() => {
              setCancelRequested(true);
              cancel({ launchTarget: viewed.launchTarget, sessionId: child.sessionId }).catch((error: unknown) => {
                setCancelRequested(false);
                onClientError(error);
              });
            }}
            size="small"
          >
            Cancel
          </Button>
        ) : null}
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 0.5 }}>
        <List dense disablePadding sx={chatWidthSx(chatWidth)}>
          <SubagentTaskView task={child.task} />
          {subagentTranscriptItems(child).map(item => (
            <ChatItemView item={item} key={item.id} />
          ))}
          {child.pendingPermission === undefined ? null : (
            <ListItem sx={{ display: 'block' }}>
              <PendingPermissionCard
                agentTitle={child.name ?? 'Subagent'}
                onSelect={optionId => {
                  respondPermission({
                    launchTarget: childLaunchTarget,
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
        <Box sx={{ ...chatWidthSx(chatWidth), maxHeight: '40%', overflowY: 'auto', px: 1, py: 0.5 }}>
          <PendingElicitationCard
            agentTitle={child.name ?? 'Subagent'}
            key={child.pendingElicitation.id}
            onAccept={(content, summary) => {
              respond({ response: { action: 'accept', content }, summary });
            }}
            onCancel={() => {
              respond({ response: { action: 'cancel' } });
            }}
            onDecline={() => {
              respond({ response: { action: 'decline' } });
            }}
            request={child.pendingElicitation.request}
          />
        </Box>
      )}
      <Box sx={chatWidthSx(chatWidth)}>
        <SubagentDock
          configOptions={configOptions}
          launchTarget={childLaunchTarget}
          unavailableModelIds={configOptionIndexes[childLaunchTarget]?.unavailableModelIds}
        />
      </Box>
    </Box>
  );
};

/** Read-only full-pane view of one subagent child: header, transcript, approval card. No composer. */
export const SubagentView: FC<{ readonly onClientError: (error: unknown) => void }> = ({ onClientError }) => {
  const viewed = useAtomValue(viewedSubagentAtom);
  return viewed === undefined ? null : (
    <SubagentViewBody key={viewed.childId} onClientError={onClientError} viewed={viewed} />
  );
};
