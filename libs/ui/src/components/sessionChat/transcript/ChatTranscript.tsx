import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { selectedBackendHarnessSnapshotAtom } from '../../../atoms/backendState.atoms.ts';
import { activateSessionAtomFn, respondPermissionAtomFn } from '../../../atoms/boundHarnessAtoms.ts';
import { isUsablePhase } from '../../../host/acpSessionBootstrap.ts';
import { agentLaunchTargetLabel } from '../../../host/agentLaunchTarget.ts';
import { hasPendingInteraction } from '../../../host/pendingInteractions.ts';
import { describeError } from '../../../host/requestError.ts';
import { PendingPermissionCard } from '../pendingInteractions/PendingPermissionCard.tsx';
import { useSessionChatSurface } from '../useSessionChatSurface.tsx';
import { chatRowKey, withKeptRows } from './chatRows.ts';
import { ChatItemView } from './ChatItemView.tsx';
import { groupChatItems, isLiveRegion, isWaitToolCall } from './workRegion/groupChatItems.ts';
import { WorkRegionView } from './workRegion/WorkRegionView.tsx';

const CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 48;
const ESTIMATED_ROW_PX = 80;
const ROW_OVERSCAN = 6;

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

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  // Virtualizer scroll adjustments fire scroll events too; only unpin after a user gesture.
  const userScrollIntentRef = useRef(false);

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

  const groupedItems = useMemo(() => groupChatItems(chatItems.filter(item => !isWaitToolCall(item))), [chatItems]);
  const isChatEmpty =
    chatItems.length === 0 && (selectedSession === undefined || !hasPendingInteraction(selectedSession));
  const showVirtualEmptyState = isVirtual && virtualEmptyState !== undefined && isChatEmpty;

  const [openRegionKeys, setOpenRegionKeys] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    pinnedToBottomRef.current = true;
    userScrollIntentRef.current = false;
    setOpenRegionKeys(new Set());
  }, [selectedLaunchTarget, selectedSession?.sessionId]);

  const onRegionOpenChange = useCallback((key: string, open: boolean) => {
    setOpenRegionKeys(previous => {
      if (previous.has(key) === open) return previous;
      const next = new Set(previous);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const indexByKey = useMemo(
    () => new Map(groupedItems.map((item, index) => [chatRowKey(item), index])),
    [groupedItems],
  );
  const getItemKey = useCallback((index: number) => chatRowKey(groupedItems[index]!), [groupedItems]);
  const virtualizer = useVirtualizer({
    count: showVirtualEmptyState || isChatEmpty ? 0 : groupedItems.length,
    getItemKey,
    getScrollElement: () => chatScrollRef.current,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: ROW_OVERSCAN,
    rangeExtractor: range =>
      withKeptRows(
        defaultRangeExtractor(range),
        [...openRegionKeys].flatMap(key => {
          const index = indexByKey.get(key);
          return index === undefined ? [] : [index];
        }),
      ),
    useFlushSync: false,
  });
  const totalSize = virtualizer.getTotalSize();

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
  }, [
    chatItems,
    selectedSession?.pendingElicitation,
    selectedSession?.pendingPermission,
    showVirtualEmptyState,
    totalSize,
  ]);

  return (
    <Box
      onKeyDown={event => {
        if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'Home') {
          userScrollIntentRef.current = true;
        }
      }}
      onScroll={event => {
        const target = event.currentTarget;
        const nearBottom =
          target.scrollHeight - target.scrollTop - target.clientHeight <= CHAT_SCROLL_BOTTOM_THRESHOLD_PX;
        if (nearBottom) {
          pinnedToBottomRef.current = true;
          userScrollIntentRef.current = false;
        } else if (userScrollIntentRef.current) pinnedToBottomRef.current = false;
      }}
      onTouchMove={() => {
        userScrollIntentRef.current = true;
      }}
      onWheel={event => {
        if (event.deltaY < 0) userScrollIntentRef.current = true;
      }}
      ref={chatScrollRef}
      // No top padding: sticky Work region headers stick at the padding edge, and content would show above them.
      sx={{ bgcolor: 'transparent', flex: 1, minHeight: 0, overflow: 'auto', pb: 0.5, pt: 0, px: 0.5 }}
    >
      <List dense disablePadding>
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
          <Box sx={{ height: totalSize, position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map(row => {
              const item = groupedItems[row.index]!;
              return (
                <List
                  data-index={row.index}
                  dense
                  disablePadding
                  key={row.key}
                  ref={virtualizer.measureElement}
                  sx={{ left: 0, position: 'absolute', top: row.start, width: '100%' }}
                >
                  {item.kind === 'work_region' ? (
                    <WorkRegionView
                      availableCommands={availableCommands}
                      inFlight={isLiveRegion(item) && selectedSession?.pendingClientRequest === 'prompt'}
                      onOpenChange={open => {
                        onRegionOpenChange(chatRowKey(item), open);
                      }}
                      region={item}
                    />
                  ) : (
                    <ChatItemView availableCommands={availableCommands} item={item} />
                  )}
                </List>
              );
            })}
          </Box>
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
