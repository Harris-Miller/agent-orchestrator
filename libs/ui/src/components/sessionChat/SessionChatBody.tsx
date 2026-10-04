import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import Stop from '@mui/icons-material/Stop';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode, SubmitEvent } from 'react';

import {
  configOptionIndexAtom,
  readyLaunchTargetsAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  unifiedSessionRosterAtom,
} from '../../atoms/backendState.atoms.ts';
import {
  activateSessionAtomFn,
  cancelPromptAtomFn,
  handoffSessionAtomFn,
  refreshSessionFsListingAtomFn,
  respondElicitationAtomFn,
  respondPermissionAtomFn,
  sendChatItemAtomFn,
  setConfigOptionAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import { draftAtom } from '../../atoms/chat.atoms.ts';
import { handoffInProgressAtom } from '../../atoms/handoff.atoms.ts';
import { sessionFsListingAtom, sessionFsListingKey } from '../../atoms/sessionFsListing.atoms.ts';
import { normalizeConfigOptions } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from '../../host/agentLaunchTarget.ts';
import type { FdListingEntry } from '../../host/fdListing.ts';
import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';
import { hostRuntime } from '../../hostRuntime.ts';
import { isRecord } from '../../isRecord.ts';

import { ChatItemView } from './ChatItemView.tsx';
import { ComposerCommandMenu } from './ComposerCommandMenu.tsx';
import type { ComposerTrigger } from './composerCommandTokens.ts';
import { commandInvocation, replaceComposerTriggerRange } from './composerCommandTokens.ts';
import { ComposerMentionMenu } from './ComposerMentionMenu.tsx';
import { ComposerPromptEditor } from './ComposerPromptEditor.tsx';
import type { ComposerPromptChange } from './ComposerPromptEditor.tsx';
import { detectComposerTrigger } from './detectComposerTrigger.ts';
import { filterAvailableCommands } from './filterAvailableCommands.ts';
import { filterFsListingEntries } from './filterFsListingEntries.ts';
import { HandoffModal } from './HandoffModal.tsx';
import { mentionMarkdownForEntry } from './mentionMarkdown.ts';
import { PendingElicitationCard } from './PendingElicitationCard.tsx';
import { PendingPermissionCard } from './PendingPermissionCard.tsx';
import { resolveComposerFsMentions } from './resolveComposerFsMentions.ts';
import { SessionConfigOptionControl } from './SessionConfigOptionControl.tsx';
import { UsagePopover } from './UsagePopover.tsx';

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
  readonly onClientError: (error: unknown) => void;
}> = ({ onClientError }) => {
  const selectedLaunchTarget = useAtomValue(selectedSessionLaunchTargetAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const draftSessionId = selectedSessionId ?? '';
  const [draft, setDraft] = useAtom(draftAtom(draftSessionId));
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const handoffInProgress = useAtomValue(handoffInProgressAtom);
  const roster = useAtomValue(unifiedSessionRosterAtom);
  const readyLaunchTargets = useAtomValue(readyLaunchTargetsAtom);
  const claudeConfigIndex = useAtomValue(configOptionIndexAtom('claude-agent-acp'));
  const codexConfigIndex = useAtomValue(configOptionIndexAtom('codex-acp'));
  const geminiConfigIndex = useAtomValue(configOptionIndexAtom('gemini-cli'));
  const sendChatItem = useAtomSet(sendChatItemAtomFn, { mode: 'promise' });
  const cancelPrompt = useAtomSet(cancelPromptAtomFn, { mode: 'promise' });
  const activateSession = useAtomSet(activateSessionAtomFn, { mode: 'promise' });
  const handoffSession = useAtomSet(handoffSessionAtomFn, { mode: 'promise' });
  const setConfigOption = useAtomSet(setConfigOptionAtomFn, { mode: 'promise' });
  const respondElicitation = useAtomSet(respondElicitationAtomFn, { mode: 'promise' });
  const respondPermission = useAtomSet(respondPermissionAtomFn, { mode: 'promise' });
  const refreshSessionFsListing = useAtomSet(refreshSessionFsListingAtomFn, { mode: 'promise' });

  const getConfigOptionIndex = (launchTarget: AgentLaunchTarget) => {
    switch (launchTarget) {
      case 'claude-agent-acp':
        return claudeConfigIndex;
      case 'codex-acp':
        return codexConfigIndex;
      case 'gemini-cli':
        return geminiConfigIndex;
    }
  };

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const [splitMenuAnchor, setSplitMenuAnchor] = useState<HTMLElement | null>(null);
  const [handoffModalOpen, setHandoffModalOpen] = useState(false);
  const [composerTrigger, setComposerTrigger] = useState<ComposerTrigger | null>(null);
  const [commandFocusIndex, setCommandFocusIndex] = useState(0);
  const composerCursorRef = useRef(0);
  const syncCursorRef = useRef<null | number>(null);

  const chatItems = useMemo(() => selectedSession?.transcript.items ?? [], [selectedSession?.transcript.items]);
  const availableCommands = useMemo(
    () => selectedSession?.availableCommands ?? [],
    [selectedSession?.availableCommands],
  );
  const configOptions = normalizeConfigOptions(selectedSession?.sessionConfiguration);
  const hasPendingInteraction =
    selectedSession?.pendingElicitation !== undefined || selectedSession?.pendingPermission !== undefined;
  const pendingClientRequest = selectedSession?.pendingClientRequest !== undefined;
  const canCancelPromptTurn = selectedSession?.pendingClientRequest === 'prompt';
  const controlsEnabled =
    selectedSession?.status === 'active' && !pendingClientRequest && !hasPendingInteraction && !handoffInProgress;
  const canSend = controlsEnabled && selectedLaunchTarget !== undefined && draft.trim().length > 0;
  const hasTranscriptMessage = chatItems.some(item => item.kind === 'user_message' || item.kind === 'agent_message');
  const sourceCwd =
    selectedLaunchTarget === undefined || selectedSessionId === undefined
      ? undefined
      : roster.find(entry => entry.launchTarget === selectedLaunchTarget && entry.sessionId === selectedSessionId)?.cwd;
  const sessionCwd = selectedSession?.cwd ?? sourceCwd;
  const listingKey =
    selectedSessionId !== undefined && sessionCwd !== undefined
      ? sessionFsListingKey(selectedSessionId, sessionCwd)
      : null;
  const fsListing = useAtomValue(sessionFsListingAtom(listingKey ?? '\0'));
  const canHandoff =
    controlsEnabled &&
    selectedLaunchTarget !== undefined &&
    selectedSessionId !== undefined &&
    hasTranscriptMessage &&
    sourceCwd !== undefined;
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

  const filteredCommands = useMemo(() => {
    if (commandTrigger === null) {
      return [];
    }
    return filterAvailableCommands(availableCommands, commandTrigger.kind, commandTrigger.query, selectedLaunchTarget);
  }, [availableCommands, commandTrigger, selectedLaunchTarget]);

  const filteredMentions = useMemo(() => {
    if (mentionTrigger === null) {
      return [];
    }
    return filterFsListingEntries(fsListing.entries, mentionTrigger.query);
  }, [fsListing.entries, mentionTrigger]);

  const mentionLoading = mentionTrigger !== null && fsListing.status === 'loading';

  const clampedCommandFocus =
    filteredCommands.length === 0 ? 0 : Math.min(commandFocusIndex, filteredCommands.length - 1);
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
      const next = replaceComposerTriggerRange(draft, liveTrigger, mentionMarkdownForEntry(sessionCwd, entry));
      syncCursorRef.current = next.cursor;
      composerCursorRef.current = next.cursor;
      setDraft(next.text);
      setComposerTrigger(null);
    },
    [draft, selectedLaunchTarget, sessionCwd, setDraft],
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

  const activeMenuCount = mentionTrigger !== null ? filteredMentions.length : filteredCommands.length;

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
          if (filteredMentions.length === 0) {
            return;
          }
          selectMention(filteredMentions[clampedMentionFocus]);
          return;
        }
        if (filteredCommands.length === 0) {
          return;
        }
        selectCommand(filteredCommands[clampedCommandFocus]);
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
      filteredCommands,
      filteredMentions,
      mentionTrigger,
      selectCommand,
      selectMention,
    ],
  );

  const mentionMenuOpen = mentionTrigger !== null;

  // Refresh FS listing when `@` menu opens (stale hits OK while refresh runs).
  useEffect(() => {
    if (!mentionMenuOpen || selectedSessionId === undefined || sessionCwd === undefined) {
      return;
    }
    refreshSessionFsListing({ cwd: sessionCwd, sessionId: selectedSessionId }).catch(() => undefined);
  }, [mentionMenuOpen, refreshSessionFsListing, selectedSessionId, sessionCwd]);

  // Paste / whitespace-commit: resolve `@path` and FS markdown links in parallel.
  // Skip while a composer trigger menu is open so typing `@query` does not rewrite mid-edit.
  useEffect(() => {
    if (sessionCwd === undefined || draft.length === 0 || composerTrigger !== null) {
      return;
    }
    let cancelled = false;
    const cursor = composerCursorRef.current;
    hostRuntime
      .runPromise(resolveComposerFsMentions(draft, sessionCwd))
      .then(next => {
        if (!cancelled && next !== draft) {
          syncCursorRef.current = cursor;
          setDraft(next);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [composerTrigger, draft, sessionCwd, setDraft]);

  const sendDraft = () => {
    if (selectedLaunchTarget === undefined || !controlsEnabled || draft.trim().length === 0) {
      return;
    }

    const text = draft;
    setComposerTrigger(null);
    setDraft('');
    sendChatItem({ launchTarget: selectedLaunchTarget, text }).catch(onClientError);
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

  const emptyStateSecondary: ReactNode = (() => {
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
        gap: 2,
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        p: 2,
      }}
    >
      <Paper
        onScroll={event => {
          const target = event.currentTarget;
          pinnedToBottomRef.current =
            target.scrollHeight - target.scrollTop - target.clientHeight <= CHAT_SCROLL_BOTTOM_THRESHOLD_PX;
        }}
        ref={chatScrollRef}
        sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1 }}
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
      </Paper>

      <Paper sx={{ flexShrink: 0, p: 2 }}>
        <Stack spacing={1}>
          {backendSnapshot?.error !== undefined ? (
            <Typography color="error" variant="body2">
              {backendSnapshot.error}
            </Typography>
          ) : null}
          <Box component="form" onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <ComposerCommandMenu
              commands={filteredCommands}
              focusedIndex={clampedCommandFocus}
              onFocusIndexChange={setCommandFocusIndex}
              onSelect={selectCommand}
              open={commandTrigger !== null}
            />
            <ComposerMentionMenu
              entries={filteredMentions}
              focusedIndex={clampedMentionFocus}
              loading={mentionLoading}
              onFocusIndexChange={setCommandFocusIndex}
              onSelect={selectMention}
              open={mentionTrigger !== null}
            />
            <ComposerPromptEditor
              availableCommands={availableCommands}
              commandMenu={commandMenu}
              disabled={!controlsEnabled}
              key={selectedSessionId ?? 'none'}
              onChange={onComposerChange}
              onSubmit={sendDraft}
              placeholder={
                selectedLaunchTarget === undefined
                  ? 'Select a session…'
                  : `Message ${agentLaunchTargetLabel(selectedLaunchTarget)}…`
              }
              syncCursorRef={syncCursorRef}
              value={draft}
            />
            <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {configOptions.map(option => (
                <SessionConfigOptionControl
                  disabled={!controlsEnabled || selectedLaunchTarget === undefined}
                  key={option.id}
                  onChange={diff => {
                    if (selectedLaunchTarget === undefined) {
                      return;
                    }
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
                  }}
                  option={option}
                />
              ))}
              <Box sx={{ flexGrow: 1 }} />
              <UsagePopover usage={selectedSession?.usage} />
              <ButtonGroup variant="contained">
                <Button
                  aria-label={
                    canCancelPromptTurn
                      ? 'Prompt turn cancel'
                      : pendingClientRequest
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
                    <Stop fontSize="small" />
                  ) : pendingClientRequest ? (
                    <CircularProgress color="inherit" size={18} />
                  ) : (
                    <ArrowUpward fontSize="small" />
                  )}
                </Button>
                <Button
                  aria-controls={splitMenuAnchor !== null ? 'send-split-menu' : undefined}
                  aria-expanded={splitMenuAnchor !== null ? 'true' : undefined}
                  aria-haspopup="menu"
                  aria-label="Open send options"
                  disabled={handoffInProgress || selectedLaunchTarget === undefined}
                  onClick={event => {
                    setSplitMenuAnchor(event.currentTarget);
                  }}
                  size="small"
                >
                  <KeyboardArrowDown />
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
              </Menu>
            </Box>
          </Box>
        </Stack>
      </Paper>

      {selectedLaunchTarget !== undefined && handoffModalOpen ? (
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
