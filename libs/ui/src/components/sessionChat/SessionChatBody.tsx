import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Effect } from 'effect';
import { ArrowUp, ChevronDown, Paperclip, Square } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode, SubmitEvent } from 'react';

import { selectedBackendHarnessSnapshotAtom } from '../../atoms/backendState.atoms.ts';
import {
  activateSessionAtomFn,
  alwaysHiddenGlobsAtom,
  cancelPromptAtomFn,
  handoffSessionAtomFn,
  materializeVirtualThenSendAtomFn,
  patchVirtualSessionAtomFn,
  refreshSessionFsListingAtomFn,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
  sendChatItemAtomFn,
  setConfigOptionAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import { useSelectedSessionFsListing } from '../../atoms/useSelectedSessionFsListing.ts';
import { agentLaunchTargetLabel } from '../../host/agentLaunchTarget.ts';
import { rowForModel } from '../../host/configOptionIndexUi.ts';
import { preserveConfigValuesOnModelChange } from '../../host/configProbe.ts';
import { mimeTypeForImagePath, validateImageAttachments } from '../../host/draftToContentBlocks.ts';
import type { FdListingEntry } from '../../host/fdListing.ts';
import {
  appendUniqueComposerAttachments,
  composerImageAttachmentFromPath,
  pickComposerImages,
} from '../../host/pickComposerImages.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';
import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';
import { hostRuntime } from '../../hostRuntime.ts';
import { isRecord } from '../../isRecord.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { ChatItemView } from './ChatItemView.tsx';
import { ComposerCommandMenu } from './ComposerCommandMenu.tsx';
import type { ComposerTrigger } from './composerCommandTokens.ts';
import { commandInvocation, replaceComposerTriggerRange } from './composerCommandTokens.ts';
import { ComposerImageAttachments } from './ComposerImageAttachments.tsx';
import { ComposerMentionMenu } from './ComposerMentionMenu.tsx';
import { ComposerPromptEditor } from './ComposerPromptEditor.tsx';
import type { ComposerPromptChange } from './ComposerPromptEditor.tsx';
import { detectComposerTrigger } from './detectComposerTrigger.ts';
import { filterAvailableCommandMatches } from './filterAvailableCommands.ts';
import { filterFsListingMatches } from './filterFsListingEntries.ts';
import { HandoffModal } from './HandoffModal.tsx';
import { absolutePathForMentionEntry, mentionMarkdownForEntry } from './mentionMarkdown.ts';
import { partitionComposerConfigOptions } from './partitionComposerConfigOptions.ts';
import { PendingElicitationCard } from './PendingElicitationCard.tsx';
import { PendingPermissionCard } from './PendingPermissionCard.tsx';
import { resolveComposerFsMentions } from './resolveComposerFsMentions.ts';
import { SessionAccessChip } from './SessionAccessChip.tsx';
import { SessionAgentChip } from './SessionAgentChip.tsx';
import { SessionConfigOptionControl } from './SessionConfigOptionControl.tsx';
import { SessionModelEffortChip } from './SessionModelEffortChip.tsx';
import { UsagePopover } from './UsagePopover.tsx';
import { useSessionChatSurface } from './useSessionChatSurface.ts';

const CHAT_SCROLL_BOTTOM_THRESHOLD_PX = 48;

const formatActivationDefect = (defect: unknown): string => {
  if (!isRecord(defect)) {
    return String(defect);
  }
  const message = typeof defect.message === 'string' ? defect.message : undefined;
  const details = isRecord(defect.data) && typeof defect.data.details === 'string' ? defect.data.details : undefined;
  if (message !== undefined && details !== undefined) {
    return `${message}: ${details}`;
  }
  if (message !== undefined) {
    return message;
  }
  return JSON.stringify(defect);
};

export const SessionChatBody: FC<{
  readonly aboveComposer?: ReactNode;
  readonly onClientError: (error: unknown) => void;
}> = ({ aboveComposer, onClientError }) => {
  const {
    attachments,
    availableCommands,
    canCancelPromptTurn,
    canForkBase: canFork,
    canHandoffBase: canHandoff,
    canSend,
    chatItems,
    chromeLocked,
    configOptions,
    controlsEnabled,
    draft,
    getConfigOptionIndex,
    hasPendingInteraction,
    isVirtual,
    pendingClientRequest,
    readyLaunchTargets,
    requestFork,
    selectedLaunchTarget,
    selectedSession,
    selectedSessionId,
    setAttachments,
    setDraft,
    setVirtualLaunchTarget,
    virtualBoundSessionId,
    virtualConfigIndex,
    virtualConfigValues,
    virtualLifecycleInFlight,
  } = useSessionChatSurface();
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const { fsListing, selectedSessionId: fsListingSessionId, sessionCwd } = useSelectedSessionFsListing();
  const alwaysHiddenGlobs = useAtomValue(alwaysHiddenGlobsAtom);
  const sendChatItem = useAtomSet(sendChatItemAtomFn, { mode: 'promise' });
  const materializeVirtualThenSend = useAtomSet(materializeVirtualThenSendAtomFn, { mode: 'promise' });
  const patchVirtualSession = useAtomSet(patchVirtualSessionAtomFn, { mode: 'promise' });
  const cancelPrompt = useAtomSet(cancelPromptAtomFn, { mode: 'promise' });
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const handoffSession = useAtomSet(handoffSessionAtomFn, { mode: 'promise' });
  const setConfigOption = useAtomSet(setConfigOptionAtomFn, { mode: 'promise' });
  const respondElicitation = useAtomSet(respondElicitationAtomFn, { mode: 'promise' });
  const respondPermission = useAtomSet(respondPermissionAtomFn, { mode: 'promise' });
  const refreshSessionFsListing = useAtomSet(refreshSessionFsListingAtomFn, { mode: 'promise' });

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const [splitMenuAnchor, setSplitMenuAnchor] = useState<HTMLElement | null>(null);
  const [handoffModalOpen, setHandoffModalOpen] = useState(false);
  const [composerTrigger, setComposerTrigger] = useState<ComposerTrigger | null>(null);
  const [commandFocusIndex, setCommandFocusIndex] = useState(0);
  const composerCursorRef = useRef(0);
  const syncCursorRef = useRef<null | number>(null);

  const agentTitle = selectedLaunchTarget === undefined ? 'Agent' : agentLaunchTargetLabel(selectedLaunchTarget);

  const commandTrigger = useMemo((): ({ readonly kind: 'dollar' | 'slash' } & ComposerTrigger) | null => {
    if (composerTrigger === null) {
      return null;
    }
    if (composerTrigger.kind === 'slash' || composerTrigger.kind === 'dollar') {
      return {
        kind: composerTrigger.kind,
        query: composerTrigger.query,
        rangeEnd: composerTrigger.rangeEnd,
        rangeStart: composerTrigger.rangeStart,
      };
    }
    return null;
  }, [composerTrigger]);
  const mentionTrigger = composerTrigger?.kind === 'at' ? composerTrigger : null;

  const filteredCommandMatches = useMemo(() => {
    if (commandTrigger === null) {
      return [];
    }
    return filterAvailableCommandMatches(
      availableCommands,
      commandTrigger.kind,
      commandTrigger.query,
      selectedLaunchTarget,
    );
  }, [availableCommands, commandTrigger, selectedLaunchTarget]);

  const filteredMentions = useMemo(() => {
    if (mentionTrigger === null) {
      return [];
    }
    return filterFsListingMatches(fsListing.entries, mentionTrigger.query);
  }, [fsListing.entries, mentionTrigger]);

  const mentionLoading = mentionTrigger !== null && fsListing.status === 'loading';

  const clampedCommandFocus =
    filteredCommandMatches.length === 0 ? 0 : Math.min(commandFocusIndex, filteredCommandMatches.length - 1);
  const clampedMentionFocus =
    filteredMentions.length === 0 ? 0 : Math.min(commandFocusIndex, filteredMentions.length - 1);

  const selectCommand = useCallback(
    (command: AvailableCommand) => {
      const liveTrigger = detectComposerTrigger({
        adjacentToToken: false,
        cursor: composerCursorRef.current,
        launchTarget: selectedLaunchTarget,
        text: draft,
      });
      if (liveTrigger?.kind === 'at' || liveTrigger === null) {
        setComposerTrigger(null);
        return;
      }
      const next = replaceComposerTriggerRange(draft, liveTrigger, commandInvocation(command.name));
      syncCursorRef.current = next.cursor;
      composerCursorRef.current = next.cursor;
      setDraft(next.text);
      setComposerTrigger(null);
    },
    [draft, selectedLaunchTarget, setDraft],
  );

  const selectMention = useCallback(
    (entry: FdListingEntry) => {
      const liveTrigger = detectComposerTrigger({
        adjacentToToken: false,
        cursor: composerCursorRef.current,
        launchTarget: selectedLaunchTarget,
        text: draft,
      });
      if (liveTrigger?.kind !== 'at' || sessionCwd === undefined) {
        setComposerTrigger(null);
        return;
      }
      const absolute = absolutePathForMentionEntry(sessionCwd, entry);
      if (entry.kind === 'file' && mimeTypeForImagePath(absolute) !== undefined) {
        const next = replaceComposerTriggerRange(draft, liveTrigger, '');
        syncCursorRef.current = next.cursor;
        composerCursorRef.current = next.cursor;
        setDraft(next.text);
        setComposerTrigger(null);
        hostRuntime
          .runPromise(
            Effect.gen(function* () {
              const attachment = yield* composerImageAttachmentFromPath(absolute);
              const merged = appendUniqueComposerAttachments(attachments, [attachment]);
              if (merged.length === attachments.length) {
                return undefined;
              }
              yield* validateImageAttachments(merged);
              return merged;
            }),
          )
          .then(merged => {
            if (merged !== undefined) {
              setAttachments(merged);
            }
          })
          .catch(onClientError);
        return;
      }
      const next = replaceComposerTriggerRange(draft, liveTrigger, mentionMarkdownForEntry(sessionCwd, entry));
      syncCursorRef.current = next.cursor;
      composerCursorRef.current = next.cursor;
      setDraft(next.text);
      setComposerTrigger(null);
    },
    [attachments, draft, onClientError, selectedLaunchTarget, sessionCwd, setAttachments, setDraft],
  );

  const onComposerChange = useCallback(
    ({ adjacentToToken, cursor, text }: ComposerPromptChange) => {
      composerCursorRef.current = cursor;
      setDraft(text);
      const trigger = detectComposerTrigger({
        adjacentToToken,
        cursor,
        launchTarget: selectedLaunchTarget,
        text,
      });
      setComposerTrigger(prev => {
        if (trigger === null) {
          return null;
        }
        if (prev !== null && prev.kind === trigger.kind && prev.query === trigger.query) {
          return { ...trigger };
        }
        setCommandFocusIndex(0);
        return trigger;
      });
    },
    [selectedLaunchTarget, setDraft],
  );

  const activeMenuCount = mentionTrigger !== null ? filteredMentions.length : filteredCommandMatches.length;

  const commandMenu = useMemo(
    () => ({
      onArrowDown: () => {
        setCommandFocusIndex(index => (activeMenuCount === 0 ? 0 : Math.min(index + 1, activeMenuCount - 1)));
      },
      onArrowUp: () => {
        setCommandFocusIndex(index => Math.max(index - 1, 0));
      },
      onDismiss: () => {
        setComposerTrigger(null);
      },
      onSelect: () => {
        if (mentionTrigger !== null) {
          const match = filteredMentions.at(clampedMentionFocus);
          if (match == null) {
            return;
          }
          selectMention(match.entry);
          return;
        }
        const commandMatch = filteredCommandMatches.at(clampedCommandFocus);
        if (commandMatch == null) {
          return;
        }
        selectCommand(commandMatch.command);
      },
      onSpaceDismiss: () => {
        setComposerTrigger(null);
      },
      open: composerTrigger !== null,
    }),
    [
      activeMenuCount,
      clampedCommandFocus,
      clampedMentionFocus,
      composerTrigger,
      filteredCommandMatches,
      filteredMentions,
      mentionTrigger,
      selectCommand,
      selectMention,
    ],
  );

  // Preload `@` FS listing once Bound Virtual / Session has id+cwd (and when Always-hidden globs change).
  // Use active-session id — Session-arm `selectedSessionId` is undefined while Selected is Virtual.
  useEffect(() => {
    if (fsListingSessionId === undefined || sessionCwd === undefined) {
      return;
    }
    refreshSessionFsListing({ cwd: sessionCwd, sessionId: fsListingSessionId }).catch(() => undefined);
  }, [alwaysHiddenGlobs, fsListingSessionId, refreshSessionFsListing, sessionCwd]);

  // Paste / whitespace-commit: resolve `@path` and FS markdown links in parallel.
  // Image hits become attachments (same as paperclip / @-menu); skip while trigger menu open.
  useEffect(() => {
    if (sessionCwd === undefined || draft.length === 0 || composerTrigger !== null) {
      return;
    }
    let cancelled = false;
    const cursor = composerCursorRef.current;
    hostRuntime
      .runPromise(resolveComposerFsMentions(draft, sessionCwd))
      .then(resolved => {
        if (cancelled) {
          return;
        }
        if (resolved.draft !== draft) {
          syncCursorRef.current = cursor;
          setDraft(resolved.draft);
        }
        if (resolved.imageAbsolutePaths.length === 0) {
          return;
        }
        return hostRuntime
          .runPromise(
            Effect.gen(function* () {
              const picked = yield* Effect.forEach(resolved.imageAbsolutePaths, composerImageAttachmentFromPath, {
                concurrency: 'unbounded',
              });
              const merged = appendUniqueComposerAttachments(attachments, picked);
              if (merged.length === attachments.length) {
                return undefined;
              }
              yield* validateImageAttachments(merged);
              return merged;
            }),
          )
          .then(merged => {
            if (!cancelled && merged !== undefined) {
              setAttachments(merged);
            }
          });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [attachments, composerTrigger, draft, sessionCwd, setAttachments, setDraft]);

  const onAttachImages = () => {
    if (!controlsEnabled) {
      return;
    }
    hostRuntime
      .runPromise(pickComposerImages(attachments))
      .then(picked => {
        if (picked.length > 0) {
          setAttachments(appendUniqueComposerAttachments(attachments, picked));
        }
      })
      .catch(onClientError);
  };

  const sendDraft = () => {
    if (!canSend) {
      return;
    }

    setComposerTrigger(null);
    if (isVirtual) {
      materializeVirtualThenSend(undefined).catch(onClientError);
      return;
    }
    if (selectedLaunchTarget === undefined) {
      return;
    }
    const text = draft;
    const toSend = attachments;
    setDraft('');
    setAttachments([]);
    sendChatItem({ attachments: toSend, launchTarget: selectedLaunchTarget, text }).catch(onClientError);
  };

  const onCancelPrompt = () => {
    if (selectedLaunchTarget === undefined || selectedSessionId === undefined || !canCancelPromptTurn) {
      return;
    }
    cancelPrompt({ launchTarget: selectedLaunchTarget, sessionId: selectedSessionId }).catch(onClientError);
  };

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canCancelPromptTurn) {
      onCancelPrompt();
      return;
    }
    sendDraft();
  };

  const partitionedConfig = useMemo(() => partitionComposerConfigOptions(configOptions), [configOptions]);
  const configControlsDisabled = !controlsEnabled || selectedLaunchTarget === undefined;
  const unavailableModelIds =
    selectedLaunchTarget === undefined ? undefined : getConfigOptionIndex(selectedLaunchTarget)?.unavailableModelIds;

  const onConfigOptionChange = (diff: ConfigValueDiff) => {
    if (selectedLaunchTarget === undefined) {
      return;
    }
    if (isVirtual && virtualBoundSessionId === undefined) {
      const nextConfigValues =
        diff.type === 'select' && diff.configId === 'model'
          ? preserveConfigValuesOnModelChange(
              { ...virtualConfigValues, model: diff.value },
              rowForModel(virtualConfigIndex, diff.value),
            )
          : { ...virtualConfigValues, [diff.configId]: diff.value };
      patchVirtualSession({ configValues: nextConfigValues }).catch(() => undefined);
      return;
    }
    // Session arm or Bound Virtual: live setConfigOption (AtomFn owns Virtual blob preserve).
    setConfigOption(
      diff.type === 'boolean'
        ? {
            configId: diff.configId,
            launchTarget: selectedLaunchTarget,
            type: 'boolean',
            value: diff.value,
          }
        : {
            configId: diff.configId,
            launchTarget: selectedLaunchTarget,
            type: 'select',
            value: diff.value,
          },
    ).catch(onClientError);
  };

  const emptyStateSecondary: ReactNode = (() => {
    if (isVirtual) {
      return <Alert severity="info">New session — choose an agent and project, then send a prompt to create it.</Alert>;
    }
    if (selectedLaunchTarget === undefined) {
      return <Alert severity="info">No session selected — create or select a session.</Alert>;
    }
    if (backendSnapshot?.phase !== 'ready') {
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
            Activation failed — {selectedSession.defects.map(formatActivationDefect).join('; ')}
          </Alert>
        );
      }
      return <Alert severity="info">Session is inactive — select it again to activate.</Alert>;
    }
    return <Alert severity="info">{agentLaunchTargetLabel(selectedLaunchTarget)} is connected — send a prompt</Alert>;
  })();

  useEffect(() => {
    pinnedToBottomRef.current = true;
  }, [selectedLaunchTarget, selectedSession?.sessionId]);

  useLayoutEffect(() => {
    const chatScroll = chatScrollRef.current;
    if (chatScroll === null || !pinnedToBottomRef.current) {
      return;
    }

    chatScroll.scrollTop = chatScroll.scrollHeight;
  }, [chatItems, selectedSession?.pendingElicitation, selectedSession?.pendingPermission]);

  return (
    <Box
      component="main"
      sx={{
        bgcolor: 'background.default',
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        gap: 0.5,
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        p: 0.5,
      }}
    >
      <Box
        onScroll={event => {
          const target = event.currentTarget;
          pinnedToBottomRef.current =
            target.scrollHeight - target.scrollTop - target.clientHeight <= CHAT_SCROLL_BOTTOM_THRESHOLD_PX;
        }}
        ref={chatScrollRef}
        sx={{ bgcolor: 'transparent', flex: 1, minHeight: 0, overflow: 'auto', p: 0.5 }}
      >
        <List dense disablePadding>
          {chatItems.length === 0 && !hasPendingInteraction ? (
            <ListItem>
              <ListItemText
                primary="No messages yet"
                secondary={emptyStateSecondary}
                slotProps={{ secondary: { component: 'div' } }}
              />
            </ListItem>
          ) : (
            chatItems.map(item => <ChatItemView availableCommands={availableCommands} item={item} key={item.id} />)
          )}
          {selectedSession?.pendingElicitation !== undefined && selectedLaunchTarget !== undefined ? (
            <ListItem alignItems="flex-start" sx={{ display: 'block', px: 1, py: 1 }}>
              <PendingElicitationCard
                agentTitle={agentTitle}
                onAccept={content => {
                  respondElicitation({
                    launchTarget: selectedLaunchTarget,
                    response: { action: 'accept', content },
                    sessionId: selectedSession.sessionId,
                  }).catch(onClientError);
                }}
                onCancel={() => {
                  respondElicitation({
                    launchTarget: selectedLaunchTarget,
                    response: { action: 'cancel' },
                    sessionId: selectedSession.sessionId,
                  }).catch(onClientError);
                }}
                onDecline={() => {
                  respondElicitation({
                    launchTarget: selectedLaunchTarget,
                    response: { action: 'decline' },
                    sessionId: selectedSession.sessionId,
                  }).catch(onClientError);
                }}
                request={selectedSession.pendingElicitation.request}
              />
            </ListItem>
          ) : null}
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

      <Box sx={{ flexShrink: 0, position: 'relative' }}>
        {backendSnapshot?.error !== undefined ? (
          <Typography color="error" sx={{ mb: 1 }} variant="body2">
            {backendSnapshot.error}
          </Typography>
        ) : null}
        <Box component="form" onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column' }}>
          {aboveComposer !== undefined && aboveComposer !== null ? (
            <Box
              sx={{
                bgcolor: 'action.hover',
                borderRadius: '14px 14px 0 0',
                color: 'text.secondary',
                fontSize: 12,
                mb: '-10px',
                mx: 1.5,
                pb: 1.75,
                pt: 1,
                px: 1.5,
              }}
            >
              {aboveComposer}
            </Box>
          ) : null}
          <Paper
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 3,
              boxShadow: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              p: 1.5,
              position: 'relative',
            }}
          >
            <ComposerCommandMenu
              focusedIndex={clampedCommandFocus}
              matches={filteredCommandMatches}
              onFocusIndexChange={setCommandFocusIndex}
              onSelect={selectCommand}
              open={commandTrigger !== null}
            />
            <ComposerMentionMenu
              focusedIndex={clampedMentionFocus}
              loading={mentionLoading}
              matches={filteredMentions}
              onFocusIndexChange={setCommandFocusIndex}
              onSelect={selectMention}
              open={mentionTrigger !== null}
            />
            <ComposerImageAttachments
              attachments={attachments}
              disabled={!controlsEnabled}
              onRemove={id => {
                setAttachments(attachments.filter(attachment => attachment.id !== id));
              }}
            />
            <ComposerPromptEditor
              availableCommands={availableCommands}
              commandMenu={commandMenu}
              disabled={!controlsEnabled}
              key={isVirtual ? 'virtual' : (selectedSessionId ?? 'none')}
              onChange={onComposerChange}
              onSubmit={sendDraft}
              placeholder={
                isVirtual
                  ? selectedLaunchTarget === undefined
                    ? 'Choose an agent, then write a prompt…'
                    : `Message ${agentLaunchTargetLabel(selectedLaunchTarget)}…`
                  : selectedLaunchTarget === undefined
                    ? 'Select a session…'
                    : `Message ${agentLaunchTargetLabel(selectedLaunchTarget)}…`
              }
              syncCursorRef={syncCursorRef}
              value={draft}
            />
            <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              <SessionAgentChip
                disabled={chromeLocked}
                interactive={isVirtual}
                onChange={launchTarget => {
                  setVirtualLaunchTarget(launchTarget).catch(() => undefined);
                }}
                readyLaunchTargets={readyLaunchTargets}
                value={selectedLaunchTarget}
              />
              {partitionedConfig.modelEffort !== undefined ? (
                <SessionModelEffortChip
                  disabled={configControlsDisabled}
                  effort={partitionedConfig.modelEffort.effort}
                  model={partitionedConfig.modelEffort.model}
                  onChange={onConfigOptionChange}
                  unavailableModelIds={unavailableModelIds}
                />
              ) : null}
              {partitionedConfig.mode !== undefined ? (
                <SessionAccessChip
                  disabled={configControlsDisabled}
                  onChange={onConfigOptionChange}
                  option={partitionedConfig.mode}
                />
              ) : null}
              {partitionedConfig.leftovers.map(option => (
                <SessionConfigOptionControl
                  disabled={configControlsDisabled}
                  key={option.id}
                  onChange={onConfigOptionChange}
                  option={option}
                  unavailableModelIds={unavailableModelIds}
                />
              ))}
              <Box sx={{ flexGrow: 1 }} />
              <IconButton aria-label="Attach images" disabled={!controlsEnabled} onClick={onAttachImages} size="small">
                <LucideMuiIcon fontSize="small" icon={Paperclip} />
              </IconButton>
              {isVirtual ? null : <UsagePopover usage={selectedSession?.usage} />}
              <ButtonGroup variant="contained">
                <Button
                  aria-label={
                    canCancelPromptTurn
                      ? 'Prompt turn cancel'
                      : pendingClientRequest || virtualLifecycleInFlight
                        ? 'Pending client request'
                        : 'Send'
                  }
                  disabled={canCancelPromptTurn ? false : !canSend}
                  onClick={
                    canCancelPromptTurn
                      ? event => {
                          event.preventDefault();
                          onCancelPrompt();
                        }
                      : undefined
                  }
                  sx={{ minWidth: 40, px: 1.5 }}
                  type={canCancelPromptTurn ? 'button' : 'submit'}
                >
                  {canCancelPromptTurn ? (
                    <LucideMuiIcon fontSize="small" icon={Square} />
                  ) : pendingClientRequest || virtualLifecycleInFlight ? (
                    <CircularProgress color="inherit" size={18} />
                  ) : (
                    <LucideMuiIcon fontSize="small" icon={ArrowUp} />
                  )}
                </Button>
                <Button
                  aria-controls={splitMenuAnchor !== null ? 'send-split-menu' : undefined}
                  aria-expanded={splitMenuAnchor !== null ? 'true' : undefined}
                  aria-haspopup="menu"
                  aria-label="Open send options"
                  disabled={isVirtual || chromeLocked || selectedLaunchTarget === undefined}
                  onClick={event => {
                    setSplitMenuAnchor(event.currentTarget);
                  }}
                  sx={{ minWidth: 36, px: 0.75 }}
                >
                  <LucideMuiIcon fontSize="small" icon={ChevronDown} />
                </Button>
              </ButtonGroup>
              <Menu
                anchorEl={splitMenuAnchor}
                id="send-split-menu"
                onClose={() => {
                  setSplitMenuAnchor(null);
                }}
                open={splitMenuAnchor !== null}
              >
                <MenuItem
                  disabled={!canHandoff}
                  onClick={() => {
                    setSplitMenuAnchor(null);
                    setHandoffModalOpen(true);
                  }}
                >
                  Handoff
                </MenuItem>
                <MenuItem
                  disabled={!canFork}
                  onClick={() => {
                    setSplitMenuAnchor(null);
                    requestFork()?.catch(onClientError);
                  }}
                >
                  Fork
                </MenuItem>
              </Menu>
            </Box>
          </Paper>
        </Box>
      </Box>

      {!isVirtual && selectedLaunchTarget !== undefined && handoffModalOpen ? (
        <HandoffModal
          getConfigOptionIndex={getConfigOptionIndex}
          key={`${selectedLaunchTarget}:${selectedSessionId ?? ''}`}
          onCancel={() => {
            setHandoffModalOpen(false);
          }}
          onConfirm={({ configValues, targetLaunchTarget }) => {
            if (selectedSessionId === undefined) {
              return;
            }
            setHandoffModalOpen(false);
            handoffSession({
              configValues,
              sourceLaunchTarget: selectedLaunchTarget,
              sourceSessionId: selectedSessionId,
              targetLaunchTarget,
            }).catch(onClientError);
          }}
          open
          readyLaunchTargets={readyLaunchTargets}
          sourceLaunchTarget={selectedLaunchTarget}
        />
      ) : null}
    </Box>
  );
};
