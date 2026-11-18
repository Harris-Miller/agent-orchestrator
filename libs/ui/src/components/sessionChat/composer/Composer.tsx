import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Paperclip } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode, SubmitEvent } from 'react';

import { selectedBackendHarnessSnapshotAtom } from '../../../atoms/backendState.atoms.ts';
import {
  handoffSessionAtomFn,
  refreshSessionFsListingAtomFn,
  setConfigOptionAtomFn,
} from '../../../atoms/boundHarnessAtoms.ts';
import { useSelectedSessionFsListing } from '../../../atoms/useSelectedSessionFsListing.ts';
import type { MidTurnSend } from '../../../atoms/userSettings/userSettings.atoms.ts';
import { isNotSignedIn } from '../../../host/harnessFailure.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';
import { AntigravitySignInControls } from '../../AntigravitySignInControls.tsx';
import { LucideMuiIcon } from '../../LucideMuiIcon.tsx';
import { ConfigChipRow } from '../configChips/ConfigChipRow.tsx';
import { useElicitationReply } from '../pendingInteractions/useElicitationReply.ts';
import { UsagePopover } from '../usage/UsagePopover.tsx';
import { useSessionChatSurface } from '../useSessionChatSurface.tsx';
import { composerChipRowSx, composerPaperSx } from './composerChrome.ts';
import { composerPlaceholder } from './composerPlaceholder.ts';
import { ComposerImageAttachments } from './ComposerImageAttachments.tsx';
import { ComposerPromptEditor } from './editor/ComposerPromptEditor.tsx';
import { latestPlanFilePath } from './latestPlanFilePath.ts';
import { ComposerCommandMenu } from './menu/ComposerCommandMenu.tsx';
import { ComposerMentionMenu } from './menu/ComposerMentionMenu.tsx';
import { useComposerMenu } from './menu/useComposerMenu.ts';
import { HandoffModal } from './HandoffModal.tsx';
import { PlanFileBanner } from './PlanFileBanner.tsx';
import { SendButton } from './SendButton.tsx';
import { SessionActionsStrip } from './SessionActionsStrip.tsx';

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
  const { fsListing, selectedSessionId: activeSessionId, sessionCwd } = useSelectedSessionFsListing();
  const setConfigOption = useAtomSet(setConfigOptionAtomFn, { mode: 'promise' });
  const handoffSession = useAtomSet(handoffSessionAtomFn, { mode: 'promise' });
  const refreshFsListing = useAtomSet(refreshSessionFsListingAtomFn, { mode: 'promise' });
  const onMentionOpen = useCallback(() => {
    if (activeSessionId === undefined || sessionCwd === undefined) {
      return;
    }
    refreshFsListing({ cwd: sessionCwd, sessionId: activeSessionId }).catch(() => undefined);
  }, [activeSessionId, refreshFsListing, sessionCwd]);
  const { cancelElicitation } = useElicitationReply();

  const [handoffModalOpen, setHandoffModalOpen] = useState(false);
  const {
    close: closeComposerMenu,
    commandMenuProps,
    keyHandlers,
    mentionMenuProps,
    onChange: onComposerChange,
    syncCursorRef,
  } = useComposerMenu({
    attachImages,
    availableCommands,
    draft,
    fsListing,
    launchTarget: selectedLaunchTarget,
    onClientError,
    onMentionOpen,
    sessionCwd,
    setDraft,
    targetId: composer.target?._tag === 'Virtual' ? composer.target.blobId : composer.target?.sessionId,
  });
  const focusComposerEndRef = useRef<(() => void) | null>(null);

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

  // Enter, the form and the other-mode Send button perform only Send or Steering, never Prompt turn cancel (desktop
  // ADR-0018). Shared with SendButton so closing the Composer Menu on Send lives in one place.
  const submitDraft = (mode?: MidTurnSend) => {
    if (action._tag !== 'Send' && action._tag !== 'Steer') {
      return;
    }
    if (action._tag === 'Send') {
      closeComposerMenu();
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
          <SessionActionsStrip
            aboveComposer={aboveComposer}
            onRequestHandoff={() => {
              setHandoffModalOpen(true);
            }}
          />
        </Box>
        <Paper sx={[composerPaperSx, { position: 'relative' }]}>
          <ComposerCommandMenu {...commandMenuProps} />
          <ComposerMentionMenu {...mentionMenuProps} />
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
            commandMenu={keyHandlers}
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
          <Box sx={composerChipRowSx}>
            <ConfigChipRow
              agent={{
                disabled: chromeLocked,
                interactive: isVirtual,
                onChange: launchTarget => {
                  setVirtualLaunchTarget(launchTarget).catch(() => undefined);
                },
                selectableLaunchTargets,
                unavailableReasons,
                usableLaunchTargets,
                value: selectedLaunchTarget,
              }}
              configDisabled={configControlsDisabled}
              configOptions={configOptions}
              modelSearch={
                isVirtual
                  ? {
                      getConfigOptionIndex,
                      launchTargets: selectableLaunchTargets,
                      onPickModelOnTarget: (launchTarget, modelId) => {
                        setVirtualLaunchTarget(launchTarget)
                          .then(() =>
                            setConfigOption({ configId: 'model', launchTarget, type: 'select', value: modelId }),
                          )
                          .catch(onClientError);
                      },
                    }
                  : undefined
              }
              onConfigChange={onConfigOptionChange}
              unavailableModelIds={unavailableModelIds}
            />
            <Box sx={{ flexGrow: 1 }} />
            <IconButton aria-label="Attach images" disabled={!canEdit} onClick={onAttachImages} size="small">
              <LucideMuiIcon fontSize="small" icon={Paperclip} />
            </IconButton>
            {isVirtual ? null : <UsagePopover usage={selectedSession?.usage} />}
            <SendButton onCancelPrompt={onCancelPrompt} onSubmitDraft={submitDraft} />
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
