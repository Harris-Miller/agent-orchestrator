import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Paperclip } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { DragEvent, FC, ReactNode, SubmitEvent } from 'react';

import {
  selectedBackendHarnessAntigravityAuthUrlAtom,
  selectedBackendHarnessFailureAtom,
  selectedBackendHarnessPhaseAtom,
} from '../../../atoms/backendState.atoms.ts';
import {
  handoffSessionAtomFn,
  refreshSessionFsListingAtomFn,
  setConfigOptionAtomFn,
} from '../../../atoms/boundHarnessAtoms.ts';
import { useSelectedSessionFsListing } from '../../../atoms/useSelectedSessionFsListing.ts';
import type { MidTurnSend } from '../../../atoms/userSettings/userSettings.atoms.ts';
import { AGENT_NO_IMAGES_MESSAGE, ImageAttachmentRejected } from '../../../host/composerImageAttachment.ts';
import { classifyFileDrop, filesFromDataTransfer } from '../../../host/composerImageTransfer.ts';
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
}> = memo(({ aboveComposer }) => {
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
    imagePromptSupported,
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
  const harnessPhase = useAtomValue(selectedBackendHarnessPhaseAtom);
  const harnessFailure = useAtomValue(selectedBackendHarnessFailureAtom);
  const antigravityAuthUrl = useAtomValue(selectedBackendHarnessAntigravityAuthUrlAtom);
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

  const [dragActive, setDragActive] = useState(false);

  /** Shared by paste and drop. The attach atom re-checks capability; this just avoids needless reads. */
  const attachFiles = useCallback(
    (files: readonly File[]) => {
      if (!canEdit) {
        return;
      }
      if (!imagePromptSupported) {
        // No Agent chosen yet (fresh Virtual Composer): nothing to blame, so fail silently.
        if (selectedLaunchTarget !== undefined) {
          onClientError(new ImageAttachmentRejected({ message: AGENT_NO_IMAGES_MESSAGE }));
        }
        return;
      }
      attachImages({ _tag: 'Files', files })
        .catch(onClientError)
        .finally(() => {
          focusComposerEndRef.current?.();
        });
    },
    [attachImages, canEdit, imagePromptSupported, onClientError, selectedLaunchTarget],
  );

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');
  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    setDragActive(canEdit);
  };
  const onDragLeave = (event: DragEvent) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDragActive(false);
  };
  // File drops need HTML5 DnD: desktop's `tauri.conf.json` sets `dragDropEnabled: false` (Tauri otherwise intercepts them on Windows).
  const onDrop = (event: DragEvent) => {
    setDragActive(false);
    if (!hasFiles(event)) {
      return;
    }
    // Always claim a file drop so the webview never navigates to it.
    event.preventDefault();
    if (!canEdit) {
      return;
    }
    const result = classifyFileDrop({ files: filesFromDataTransfer(event.dataTransfer) });
    if (result._tag === 'Images') {
      attachFiles(result.files);
      if (result.skippedMessage !== undefined) {
        onClientError(new ImageAttachmentRejected({ message: result.skippedMessage }));
      }
    } else if (result._tag === 'NotImages') {
      onClientError(new ImageAttachmentRejected({ message: result.message }));
    }
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
      {harnessFailure !== undefined ? (
        <Typography color="error" sx={{ mb: 1 }} variant="body2">
          {harnessFailure.message}
        </Typography>
      ) : null}
      {selectedLaunchTarget === 'antigravity-acp' && harnessPhase !== undefined ? (
        <Box sx={{ mb: 1 }}>
          <AntigravitySignInControls
            antigravityAuthUrl={antigravityAuthUrl}
            notSignedIn={isNotSignedIn(harnessFailure)}
            phase={harnessPhase}
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
        <Paper
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          sx={[
            composerPaperSx,
            { position: 'relative' },
            dragActive && { outline: '2px dashed', outlineColor: 'primary.main', outlineOffset: -2 },
          ]}
        >
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
            onPasteImages={imagePromptSupported ? attachFiles : undefined}
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
});
