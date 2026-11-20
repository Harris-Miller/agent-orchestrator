import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { FC, ReactNode } from 'react';

import { selectedBackendHarnessSnapshotAtom } from '../../../atoms/backendState.atoms.ts';
import { activateSessionAtomFn, respondPermissionAtomFn } from '../../../atoms/boundHarnessAtoms.ts';
import { isUsablePhase } from '../../../host/acpSessionBootstrap.ts';
import { agentLaunchTargetLabel } from '../../../host/agentLaunchTarget.ts';
import { hasPendingInteraction } from '../../../host/pendingInteractions.ts';
import { describeError } from '../../../host/requestError.ts';
import { useChatWidthSx } from '../chatWidth.ts';
import { PendingPermissionCard } from '../pendingInteractions/PendingPermissionCard.tsx';
import { useSessionChatSurface } from '../useSessionChatSurface.tsx';
import { sessionHasLiveWork } from '../../../host/subagent.ts';
import { ChatItemView } from './ChatItemView.tsx';
import { groupChatItems, isFoldedSubagentToolCall, isLiveRegion, isWaitToolCall } from './workRegion/groupChatItems.ts';
import { WorkRegionView } from './workRegion/WorkRegionView.tsx';

const CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 48;

/** Scroll container for the Selected session's Chat items, pinned to the bottom until the user scrolls up. */
export const ChatTranscript: FC<{
  readonly virtualEmptyState?: ReactNode;
}> = ({ virtualEmptyState }) => {
  const { chatItems, composer, isVirtual, onClientError, selectedLaunchTarget, selectedSession } =
    useSessionChatSurface();
  const { availableCommands } = composer;
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const respondPermission = useAtomSet(respondPermissionAtomFn, { mode: 'promise' });

  const turnOrBackgroundWorking =
    selectedSession !== undefined &&
    (backendSnapshot === undefined
      ? selectedSession.pendingClientRequest === 'prompt'
      : sessionHasLiveWork(backendSnapshot, selectedSession));

  const chatWidthSx = useChatWidthSx();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  const agentTitle = selectedLaunchTarget === undefined ? 'Agent' : agentLaunchTargetLabel(selectedLaunchTarget);

  const emptyStateSecondary: ReactNode = (() => {
    if (isVirtual) {
      return <Alert severity="info">New session — choose an agent and project, then send a prompt to create it.</Alert>;
    }
    if (selectedLaunchTarget === undefined) {
      return <Alert severity="info">No session selected — create or select a session.</Alert>;
    }
    if (backendSnapshot === undefined || !isUsablePhase(backendSnapshot.phase)) {
      return <Alert severity="info">Starting {agentLaunchTargetLabel(selectedLaunchTarget)} over ACP…</Alert>;
    }
    if (selectedSession === undefined) {
      return <Alert severity="info">No session selected — create or select a session.</Alert>;
    }
    if (selectedSession.status === 'activating') {
      return <Alert severity="info">Activating session…</Alert>;
    }
    if (selectedSession.status === 'inactive') {
      if (selectedSession.defects !== undefined && selectedSession.defects.length > 0) {
        return (
          <Alert
            action={
              <Button
                color="inherit"
                onClick={() => {
                  activateSession({ launchTarget: selectedLaunchTarget, sessionId: selectedSession.sessionId }).catch(
                    onClientError,
                  );
                }}
                size="small"
              >
                Retry
              </Button>
            }
            severity="error"
          >
            Activation failed — {selectedSession.defects.map(describeError).join('; ')}
          </Alert>
        );
      }
      return <Alert severity="info">Session is inactive — select it again to activate.</Alert>;
    }
    return <Alert severity="info">{agentLaunchTargetLabel(selectedLaunchTarget)} is connected — send a prompt</Alert>;
  })();

  const groupedItems = useMemo(
    () => groupChatItems(chatItems.filter(item => !isWaitToolCall(item) && !isFoldedSubagentToolCall(item))),
    [chatItems],
  );
  const isChatEmpty =
    chatItems.length === 0 && (selectedSession === undefined || !hasPendingInteraction(selectedSession));
  const showVirtualEmptyState = isVirtual && virtualEmptyState !== undefined && isChatEmpty;

  useEffect(() => {
    pinnedToBottomRef.current = true;
  }, [selectedLaunchTarget, selectedSession?.sessionId]);

  useLayoutEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (chatScroll === null) {
      return;
    }
    if (showVirtualEmptyState) {
      chatScroll.scrollTop = 0;
      return;
    }
    if (!pinnedToBottomRef.current) {
      return;
    }

    chatScroll.scrollTop = chatScroll.scrollHeight;
  }, [chatItems, selectedSession?.pendingElicitation, selectedSession?.pendingPermission, showVirtualEmptyState]);

  return (
    <Box
      onScroll={event => {
        const target = event.currentTarget;
        pinnedToBottomRef.current =
          target.scrollHeight - target.scrollTop - target.clientHeight <= CHAT_SCROLL_BOTTOM_THRESHOLD_PX;
      }}
      ref={chatScrollRef}
      // No top padding: sticky Work region headers stick at the padding edge, and content would show above them.
      sx={{ bgcolor: 'transparent', flex: 1, minHeight: 0, overflow: 'auto', pb: 0.5, pt: 0, px: 0.5 }}
    >
      <List dense disablePadding sx={chatWidthSx}>
        {showVirtualEmptyState ? (
          virtualEmptyState
        ) : isChatEmpty ? (
          <ListItem>
            <ListItemText
              primary="No messages yet"
              secondary={emptyStateSecondary}
              slotProps={{ secondary: { component: 'div' } }}
            />
          </ListItem>
        ) : (
          groupedItems.map(item =>
            item.kind === 'work_region' ? (
              <WorkRegionView
                availableCommands={availableCommands}
                inFlight={isLiveRegion(item) && turnOrBackgroundWorking}
                key={`work-${item.id}`}
                region={item}
              />
            ) : (
              <ChatItemView availableCommands={availableCommands} item={item} key={item.id} />
            ),
          )
        )}
        {selectedSession?.pendingPermission !== undefined && selectedLaunchTarget !== undefined ? (
          <ListItem alignItems="flex-start" sx={{ display: 'block', px: 1, py: 1 }}>
            <PendingPermissionCard
              agentTitle={agentTitle}
              onSelect={optionId => {
                respondPermission({
                  launchTarget: selectedLaunchTarget,
                  optionId,
                  sessionId: selectedSession.sessionId,
                }).catch(onClientError);
              }}
              request={selectedSession.pendingPermission.request}
            />
          </ListItem>
        ) : null}
      </List>
    </Box>
  );
};
