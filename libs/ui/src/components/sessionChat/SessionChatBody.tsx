import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { ArrowUpIcon, ChevronDownIcon, SquareIcon } from 'lucide-react';
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
import type { FdListingEntry } from '../../host/fdListing.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';
import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';
import { hostRuntime } from '../../hostRuntime.ts';
import { isRecord } from '../../isRecord.ts';
import { Alert, AlertDescription } from '../ui/alert.tsx';
import { Button } from '../ui/button.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';
import { Spinner } from '../ui/spinner.tsx';

import { ChatItemView } from './ChatItemView.tsx';
import { ComposerCommandMenu } from './ComposerCommandMenu.tsx';
import type { ComposerTrigger } from './composerCommandTokens.ts';
import { commandInvocation, replaceComposerTriggerRange } from './composerCommandTokens.ts';
import { ComposerMentionMenu } from './ComposerMentionMenu.tsx';
import { ComposerPromptEditor } from './ComposerPromptEditor.tsx';
import type { ComposerPromptChange } from './ComposerPromptEditor.tsx';
import { detectComposerTrigger } from './detectComposerTrigger.ts';
import { filterAvailableCommandMatches } from './filterAvailableCommands.ts';
import { filterFsListingMatches } from './filterFsListingEntries.ts';
import { HandoffModal } from './HandoffModal.tsx';
import { mentionMarkdownForEntry } from './mentionMarkdown.ts';
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

  const chatNotice = (text: string) => (
    <Alert>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );

  const loadingNotice = (text: string) => (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner className="size-4" />
      {text}
    </div>
  );

  const emptyStateSecondary: ReactNode = (() => {
    if (isVirtual) {
      return chatNotice('New session — choose an agent and project, then send a prompt to create it.');
    }
    if (selectedLaunchTarget === undefined) {
      return chatNotice('No session selected — create or select a session.');
    }
    if (backendSnapshot?.phase !== 'ready') {
      return loadingNotice(`Starting ${agentLaunchTargetLabel(selectedLaunchTarget)} over ACP…`);
    }
    if (selectedSession === undefined) {
      return chatNotice('No session selected — create or select a session.');
    }
    if (selectedSession.status === 'activating') {
      return loadingNotice('Activating session…');
    }
    if (selectedSession.status === 'inactive') {
      if (selectedSession.defects !== undefined && selectedSession.defects.length > 0) {
        return (
          <Alert variant="destructive">
            <AlertDescription>
              Activation failed — {selectedSession.defects.map(formatActivationDefect).join('; ')}
            </AlertDescription>
            <Button
              onClick={() => {
                activateSession({ launchTarget: selectedLaunchTarget, sessionId: selectedSession.sessionId }).catch(
                  onClientError,
                );
              }}
              size="sm"
              variant="outline"
            >
              Retry
            </Button>
          </Alert>
        );
      }
      return chatNotice('Session is inactive — select it again to activate.');
    }
    return chatNotice(`${agentLaunchTargetLabel(selectedLaunchTarget)} is connected — send a prompt`);
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
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden bg-background p-1">
      <div
        className="min-h-0 flex-1 overflow-auto p-1"
        onScroll={event => {
          const target = event.currentTarget;
          pinnedToBottomRef.current =
            target.scrollHeight - target.scrollTop - target.clientHeight <= CHAT_SCROLL_BOTTOM_THRESHOLD_PX;
        }}
        ref={chatScrollRef}
      >
        <div>
          {chatItems.length === 0 && !hasPendingInteraction ? (
            <div className="py-2">
              <p className="text-sm font-medium">No messages yet</p>
              <div className="mt-1">{emptyStateSecondary}</div>
            </div>
          ) : (
            chatItems.map(item => <ChatItemView availableCommands={availableCommands} item={item} key={item.id} />)
          )}
          {selectedSession?.pendingElicitation !== undefined && selectedLaunchTarget !== undefined ? (
            <div className="px-2 py-2">
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
            </div>
          ) : null}
          {selectedSession?.pendingPermission !== undefined && selectedLaunchTarget !== undefined ? (
            <div className="px-2 py-2">
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
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative shrink-0">
        {backendSnapshot?.error !== undefined ? (
          <Alert className="mb-2" variant="destructive">
            <AlertDescription>{backendSnapshot.error}</AlertDescription>
          </Alert>
        ) : null}
        <form className="flex flex-col" onSubmit={onSubmit}>
          {aboveComposer !== undefined && aboveComposer !== null ? (
            <div className="mx-3 -mb-2.5 rounded-t-[14px] bg-muted px-3 pt-2 pb-3.5 text-xs text-muted-foreground">
              {aboveComposer}
            </div>
          ) : null}
          <div className="relative flex flex-col gap-2 rounded-xl border border-border p-3 shadow-md">
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
            <div className="flex flex-wrap items-center gap-1">
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
              <div className="flex-1" />
              {isVirtual ? null : <UsagePopover usage={selectedSession?.usage} />}
              <div className="inline-flex">
                <Button
                  aria-label={
                    canCancelPromptTurn
                      ? 'Prompt turn cancel'
                      : pendingClientRequest || virtualLifecycleInFlight
                        ? 'Pending client request'
                        : 'Send'
                  }
                  className="rounded-r-none px-3"
                  disabled={canCancelPromptTurn ? false : !canSend}
                  onClick={
                    canCancelPromptTurn
                      ? event => {
                          event.preventDefault();
                          onCancelPrompt();
                        }
                      : undefined
                  }
                  type={canCancelPromptTurn ? 'button' : 'submit'}
                >
                  {canCancelPromptTurn ? (
                    <SquareIcon />
                  ) : pendingClientRequest || virtualLifecycleInFlight ? (
                    <Spinner className="size-[18px]" />
                  ) : (
                    <ArrowUpIcon />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={isVirtual || chromeLocked || selectedLaunchTarget === undefined}
                    render={<Button aria-label="Open send options" className="rounded-l-none border-l px-2" />}
                  >
                    <ChevronDownIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      disabled={!canHandoff}
                      onClick={() => {
                        setHandoffModalOpen(true);
                      }}
                    >
                      Handoff
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canFork}
                      onClick={() => {
                        requestFork()?.catch(onClientError);
                      }}
                    >
                      Fork
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </form>
      </div>

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
    </main>
  );
};
