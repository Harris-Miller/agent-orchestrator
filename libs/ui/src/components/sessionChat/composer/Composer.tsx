import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Paperclip } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode, SubmitEvent } from 'react';

import { selectedBackendHarnessSnapshotAtom } from '../../../atoms/backendState.atoms.ts';
import { handoffSessionAtomFn, setConfigOptionAtomFn } from '../../../atoms/boundHarnessAtoms.ts';
import { useSelectedSessionFsListing } from '../../../atoms/useSelectedSessionFsListing.ts';
import type { MidTurnSend } from '../../../atoms/userSettings/userSettings.atoms.ts';
import { isNotSignedIn } from '../../../host/harnessFailure.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';
import { hostRuntime } from '../../../hostRuntime.ts';
import { AntigravitySignInControls } from '../../AntigravitySignInControls.tsx';
import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';
import type { ComposerTrigger } from '../chips/composerCommandTokens.ts';
import { partitionComposerConfigOptions } from '../configChips/partitionComposerConfigOptions.ts';
import { SessionAccessChip } from '../configChips/SessionAccessChip.tsx';
import { SessionAgentChip } from '../configChips/SessionAgentChip.tsx';
import { SessionConfigOptionControl } from '../configChips/SessionConfigOptionControl.tsx';
import { SessionModelEffortChip } from '../configChips/SessionModelEffortChip.tsx';
import { useElicitationReply } from '../pendingInteractions/useElicitationReply.ts';
import { UsagePopover } from '../usage/UsagePopover.tsx';
import { useSessionChatSurface } from '../useSessionChatSurface.tsx';
import { composerPlaceholder } from './composerPlaceholder.ts';
import { ComposerImageAttachments } from './ComposerImageAttachments.tsx';
import { ComposerPromptEditor } from './editor/ComposerPromptEditor.tsx';
import type { ComposerPromptChange } from './editor/ComposerPromptEditor.tsx';
import { latestPlanFilePath } from './latestPlanFilePath.ts';
import { ComposerCommandMenu } from './menu/ComposerCommandMenu.tsx';
import { ComposerMentionMenu } from './menu/ComposerMentionMenu.tsx';
import {
  applyComposerMenuChoice,
  clampComposerMenuFocus,
  CLOSED_COMPOSER_MENU,
  composerMenuAfterChange,
  moveComposerMenuFocus,
} from './menu/composerMenu.ts';
import type { ComposerMenuChoice } from './menu/composerMenu.ts';
import { detectComposerTrigger } from './menu/detectComposerTrigger.ts';
import { filterAvailableCommandMatches } from './menu/filterAvailableCommands.ts';
import { filterFsListingMatches } from './menu/filterFsListingEntries.ts';
import { resolveComposerFsMentions } from './menu/resolveComposerFsMentions.ts';
import { HandoffModal } from './HandoffModal.tsx';
import { PlanFileBanner } from './PlanFileBanner.tsx';
import { SendButton } from './SendButton.tsx';

export const Composer: FC<{
  readonly aboveComposer?: ReactNode;
}> = ({ aboveComposer }) => {
  const {
    attachImages,
    cancelPromptTurn,
    chatItems,
    composer,
    configOptions,
    edit,
    getConfigOptionIndex,
    isVirtual,
    onClientError,
    selectableLaunchTargets,
    selectedLaunchTarget,
    selectedSession,
    selectedSessionId,
    setVirtualLaunchTarget,
    submit,
    unavailableReasons,
    unqueueMessage,
    usableLaunchTargets,
  } = useSessionChatSurface();
  const {
    action,
    attachments,
    availableCommands,
    canEdit,
    controlsEnabled,
    draft,
    locked: chromeLocked,
    queued,
  } = composer;
  const setDraft = useCallback(
    (text: string) => {
      edit({ draft: text });
    },
    [edit],
  );
  const planFilePath = useMemo(() => latestPlanFilePath(chatItems), [chatItems]);
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const { fsListing, sessionCwd } = useSelectedSessionFsListing();
  const setConfigOption = useAtomSet(setConfigOptionAtomFn, { mode: 'promise' });
  const handoffSession = useAtomSet(handoffSessionAtomFn, { mode: 'promise' });
  const { cancelElicitation } = useElicitationReply();

  const [handoffModalOpen, setHandoffModalOpen] = useState(false);
  const [menu, setMenu] = useState(CLOSED_COMPOSER_MENU);
  const composerTrigger = menu.trigger;
  const composerCursorRef = useRef(0);
  const syncCursorRef = useRef<null | number>(null);
  const focusComposerEndRef = useRef<(() => void) | null>(null);

  const commandTrigger: ({ readonly kind: 'dollar' | 'slash' } & ComposerTrigger) | null =
    composerTrigger?.kind === 'slash' || composerTrigger?.kind === 'dollar'
      ? { ...composerTrigger, kind: composerTrigger.kind }
      : null;
  const mentionTrigger = composerTrigger?.kind === 'at' ? composerTrigger : null;

  const filteredCommandMatches = useMemo(() => {
    if (composerTrigger?.kind !== 'slash' && composerTrigger?.kind !== 'dollar') {
      return [];
    }
    return filterAvailableCommandMatches(
      availableCommands,
      composerTrigger.kind,
      composerTrigger.query,
      selectedLaunchTarget,
    );
  }, [availableCommands, composerTrigger, selectedLaunchTarget]);

  const filteredMentions = useMemo(() => {
    if (mentionTrigger === null) {
      return [];
    }
    return filterFsListingMatches(fsListing.entries, mentionTrigger.query);
  }, [fsListing.entries, mentionTrigger]);

  const mentionLoading = mentionTrigger !== null && fsListing.status === 'loading';

  const clampedCommandFocus = clampComposerMenuFocus(menu.focus, filteredCommandMatches.length);
  const clampedMentionFocus = clampComposerMenuFocus(menu.focus, filteredMentions.length);

  const setMenuFocus = useCallback((focus: number) => {
    setMenu(prev => ({ ...prev, focus }));
  }, []);

  const chooseMenuItem = useCallback(
    (choice: ComposerMenuChoice) => {
      const next = applyComposerMenuChoice(
        { cursor: composerCursorRef.current, draft, launchTarget: selectedLaunchTarget, sessionCwd },
        choice,
      );
      setMenu(CLOSED_COMPOSER_MENU);
      if (next === undefined) {
        return;
      }
      syncCursorRef.current = next.cursor;
      composerCursorRef.current = next.cursor;
      setDraft(next.draft);
      if (next.imagePath !== undefined) {
        attachImages({ _tag: 'Paths', paths: [next.imagePath] }).catch(onClientError);
      }
    },
    [attachImages, draft, onClientError, selectedLaunchTarget, sessionCwd, setDraft],
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
      setMenu(prev => composerMenuAfterChange(prev, trigger));
    },
    [selectedLaunchTarget, setDraft],
  );

  const activeMenuCount = mentionTrigger !== null ? filteredMentions.length : filteredCommandMatches.length;

  const commandMenu = useMemo(
    () => ({
      onArrowDown: () => {
        setMenu(prev => moveComposerMenuFocus(prev, 1, activeMenuCount));
      },
      onArrowUp: () => {
        setMenu(prev => moveComposerMenuFocus(prev, -1, activeMenuCount));
      },
      onDismiss: () => {
        setMenu(CLOSED_COMPOSER_MENU);
      },
      onSelect: () => {
        if (mentionTrigger !== null) {
          const match = filteredMentions.at(clampedMentionFocus);
          if (match == null) {
            return;
          }
          chooseMenuItem({ _tag: 'Mention', entry: match.entry });
          return;
        }
        const commandMatch = filteredCommandMatches.at(clampedCommandFocus);
        if (commandMatch == null) {
          return;
        }
        chooseMenuItem({ _tag: 'Command', command: commandMatch.command });
      },
      onSpaceDismiss: () => {
        setMenu(CLOSED_COMPOSER_MENU);
      },
      open: composerTrigger !== null,
    }),
    [
      activeMenuCount,
      chooseMenuItem,
      clampedCommandFocus,
      clampedMentionFocus,
      composerTrigger,
      filteredCommandMatches,
      filteredMentions,
      mentionTrigger,
    ],
  );

  // Paste / whitespace-commit: resolve `@path` and FS markdown links in parallel.
  // Image hits become attachments (same as paperclip / @-menu); skip while trigger menu open. The attach is handed
  // to the Composer in the same step as the rewrite, so the re-run the rewrite causes cannot drop it.
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
        if (resolved.imageAbsolutePaths.length > 0) {
          attachImages({ _tag: 'Paths', paths: resolved.imageAbsolutePaths }).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [attachImages, composerTrigger, draft, sessionCwd, setDraft]);

  const onAttachImages = () => {
    if (!canEdit) {
      return;
    }
    attachImages({ _tag: 'Pick' })
      .catch(onClientError)
      .finally(() => {
        focusComposerEndRef.current?.();
      });
  };

  // Enter, the form and the Send options menu perform only Send or Steering, never Prompt turn cancel (desktop
  // ADR-0018). Shared with SendButton so closing the Composer Menu on Send lives in one place.
  const submitDraft = (mode?: MidTurnSend) => {
    if (action._tag !== 'Send' && action._tag !== 'Steer') {
      return;
    }
    if (action._tag === 'Send') {
      setMenu(CLOSED_COMPOSER_MENU);
    }
    submit(mode).catch(onClientError);
  };

  const onCancelPrompt = () => {
    cancelPromptTurn()?.catch(onClientError);
  };

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (action._tag === 'CancelTurn') {
      onCancelPrompt();
      return;
    }
    submitDraft();
  };

  const partitionedConfig = useMemo(() => partitionComposerConfigOptions(configOptions), [configOptions]);
  const configControlsDisabled = !controlsEnabled || selectedLaunchTarget === undefined;
  const unavailableModelIds =
    selectedLaunchTarget === undefined ? undefined : getConfigOptionIndex(selectedLaunchTarget)?.unavailableModelIds;

  const onConfigOptionChange = (diff: ConfigValueDiff) => {
    if (selectedLaunchTarget === undefined) {
      return;
    }
    // Virtual writes the blob only (AtomFn); Session arm sends live setConfigOption.
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

  return (
    <Box sx={{ flexShrink: 0, position: 'relative' }}>
      {backendSnapshot?.failure !== undefined ? (
        <Typography color="error" sx={{ mb: 1 }} variant="body2">
          {backendSnapshot.failure.message}
        </Typography>
      ) : null}
      {selectedLaunchTarget === 'antigravity-acp' && backendSnapshot !== undefined ? (
        <Box sx={{ mb: 1 }}>
          <AntigravitySignInControls
            antigravityAuthUrl={backendSnapshot.antigravityAuthUrl}
            notSignedIn={isNotSignedIn(backendSnapshot.failure)}
            phase={backendSnapshot.phase}
          />
        </Box>
      ) : null}
      <Box component="form" onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column' }}>
        {(aboveComposer !== undefined && aboveComposer !== null) || planFilePath !== undefined ? (
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
            {planFilePath === undefined ? null : <PlanFileBanner path={planFilePath} />}
            {aboveComposer}
          </Box>
        ) : null}
        <Paper
          sx={{
            bgcolor: theme => theme.palette.composerBackground,
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
            onFocusIndexChange={setMenuFocus}
            onSelect={command => {
              chooseMenuItem({ _tag: 'Command', command });
            }}
            open={commandTrigger !== null}
          />
          <ComposerMentionMenu
            focusedIndex={clampedMentionFocus}
            loading={mentionLoading}
            matches={filteredMentions}
            onFocusIndexChange={setMenuFocus}
            onSelect={entry => {
              chooseMenuItem({ _tag: 'Mention', entry });
            }}
            open={mentionTrigger !== null}
          />
          {queued === undefined ? null : (
            <Box sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex', gap: 1 }}>
              <Typography noWrap sx={{ flexGrow: 1 }} variant="body2">
                Queued:{' '}
                {[
                  queued.draft.trim(),
                  queued.attachments.length > 0 ? `(${String(queued.attachments.length)} image(s))` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              </Typography>
              <Button
                disabled={!canEdit}
                onClick={() => {
                  unqueueMessage().catch(onClientError);
                }}
                size="small"
              >
                Edit
              </Button>
            </Box>
          )}
          <ComposerImageAttachments
            attachments={attachments}
            disabled={!canEdit}
            onRemove={id => {
              edit({ attachments: attachments.filter(attachment => attachment.id !== id) });
            }}
          />
          <ComposerPromptEditor
            availableCommands={availableCommands}
            commandMenu={commandMenu}
            disabled={!canEdit}
            focusEndRef={focusComposerEndRef}
            key={isVirtual ? 'virtual' : (selectedSessionId ?? 'none')}
            onChange={onComposerChange}
            onEscape={selectedSession?.pendingElicitation === undefined ? undefined : cancelElicitation}
            onSubmit={() => {
              submitDraft();
            }}
            placeholder={composerPlaceholder(selectedLaunchTarget, isVirtual)}
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
              usableLaunchTargets={usableLaunchTargets}
              selectableLaunchTargets={selectableLaunchTargets}
              unavailableReasons={unavailableReasons}
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
            <IconButton aria-label="Attach images" disabled={!canEdit} onClick={onAttachImages} size="small">
              <LucideMuiIcon fontSize="small" icon={Paperclip} />
            </IconButton>
            {isVirtual ? null : <UsagePopover usage={selectedSession?.usage} />}
            <SendButton
              onCancelPrompt={onCancelPrompt}
              onRequestHandoff={() => {
                setHandoffModalOpen(true);
              }}
              onSubmitDraft={submitDraft}
            />
          </Box>
        </Paper>
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
          usableLaunchTargets={usableLaunchTargets}
          selectableLaunchTargets={selectableLaunchTargets}
          sourceLaunchTarget={selectedLaunchTarget}
          unavailableReasons={unavailableReasons}
        />
      ) : null}
    </Box>
  );
};
