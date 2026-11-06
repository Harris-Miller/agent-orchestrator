/** Derived Virtual-vs-Session composer surface — one branch instead of scattered isVirtual ternaries. */
import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import { useCallback, useMemo } from 'react';

import {
  backendHarnessSnapshotAtom,
  configOptionIndexAtom,
  launchTargetUnavailableReasonsAtom,
  pickerLaunchTargetsAtom,
  selectedAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  usableLaunchTargetsAtom,
} from '../../atoms/backendState.atoms.ts';
import {
  forkSessionAtomFn,
  patchVirtualSessionAtomFn,
  providerViewsAtom,
  setVirtualLaunchTargetAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import { composerAttachmentsAtom, draftAtom } from '../../atoms/chat.atoms.ts';
import { handoffInProgressAtom } from '../../atoms/handoff.atoms.ts';
import { selectedActiveSessionAtom } from '../../atoms/selectedActiveSession.atoms.ts';
import { useSelectedSessionFsListing } from '../../atoms/useSelectedSessionFsListing.ts';
import {
  virtualMaterializingAtom,
  virtualSendPendingAtom,
  virtualSessionAtom,
} from '../../atoms/virtualSession.atoms.ts';
import {
  hasSessionForkCapability,
  hasSteeringSupport,
  normalizeConfigOptions,
} from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { unavailableReason } from '../../host/providerView.ts';
import type { ComposerImageAttachment } from '../../host/composerImageAttachment.ts';
import { optionsWithValues, rowForModel } from '../../host/configOptionIndexUi.ts';

export const useSessionChatSurface = () => {
  const selected = useAtomValue(selectedAtom);
  const isVirtual = selected?._tag === 'Virtual';
  const virtualSession = useAtomValue(virtualSessionAtom);
  const activeSession = useAtomValue(selectedActiveSessionAtom);
  const selectedLaunchTargetFromSession = useAtomValue(selectedSessionLaunchTargetAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const draftSessionId = selectedSessionId ?? '';
  const [sessionDraft, setSessionDraft] = useAtom(draftAtom(draftSessionId));
  const [sessionAttachments, setSessionAttachments] = useAtom(composerAttachmentsAtom(draftSessionId));
  const selectedSession = useAtomValue(selectedSessionAtom);
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const handoffInProgress = useAtomValue(handoffInProgressAtom);
  const materializing = useAtomValue(virtualMaterializingAtom);
  const sendPendingAtomValue = useAtomValue(virtualSendPendingAtom);
  const { sessionCwd } = useSelectedSessionFsListing();
  const usableLaunchTargets = useAtomValue(usableLaunchTargetsAtom);
  const selectableLaunchTargets = useAtomValue(pickerLaunchTargetsAtom);
  const harnessReasons = useAtomValue(launchTargetUnavailableReasonsAtom);
  const providers = useAtomValue(providerViewsAtom);
  const unavailableReasons = useMemo(() => {
    const reasons = { ...harnessReasons };
    for (const provider of providers) {
      const reason = unavailableReason(provider);
      if (reason !== undefined) reasons[provider.id] = reason;
    }
    return reasons;
  }, [harnessReasons, providers]);
  const claudeConfigIndex = useAtomValue(configOptionIndexAtom('claude-agent-acp'));
  const codexConfigIndex = useAtomValue(configOptionIndexAtom('codex-acp'));
  const cursorConfigIndex = useAtomValue(configOptionIndexAtom('cursor-acp'));
  const antigravityConfigIndex = useAtomValue(configOptionIndexAtom('antigravity-acp'));
  const patchVirtualSession = useAtomSet(patchVirtualSessionAtomFn, { mode: 'promise' });
  const setVirtualLaunchTarget = useAtomSet(setVirtualLaunchTargetAtomFn, { mode: 'promise' });
  const forkSession = useAtomSet(forkSessionAtomFn, { mode: 'promise' });

  const selectedLaunchTarget = isVirtual ? virtualSession?.launchTarget : selectedLaunchTargetFromSession;
  const activeBackendSnapshot = useAtomValue(backendHarnessSnapshotAtom(activeSession?.launchTarget ?? 'codex-acp'));
  const selectedLaunchHarness = useAtomValue(
    backendHarnessSnapshotAtom(selectedLaunchTarget ?? activeSession?.launchTarget ?? 'codex-acp'),
  );
  const boundVirtualSession =
    isVirtual && activeSession !== undefined ? activeBackendSnapshot.sessions[activeSession.sessionId] : undefined;

  const getConfigOptionIndex = useCallback(
    (launchTarget: AgentLaunchTarget) => {
      switch (launchTarget) {
        case 'antigravity-acp':
          return antigravityConfigIndex;
        case 'claude-agent-acp':
          return claudeConfigIndex;
        case 'codex-acp':
          return codexConfigIndex;
        case 'cursor-acp':
          return cursorConfigIndex;
      }
    },
    [antigravityConfigIndex, claudeConfigIndex, codexConfigIndex, cursorConfigIndex],
  );

  const draft = isVirtual ? (virtualSession?.draft ?? '') : sessionDraft;
  const setDraft = useCallback(
    (text: string) => {
      if (isVirtual) {
        patchVirtualSession({ draft: text }).catch(() => undefined);
        return;
      }
      setSessionDraft(text);
    },
    [isVirtual, patchVirtualSession, setSessionDraft],
  );

  const attachments: readonly ComposerImageAttachment[] = isVirtual
    ? (virtualSession?.attachments ?? [])
    : sessionAttachments;
  const setAttachments = useCallback(
    (next: readonly ComposerImageAttachment[]) => {
      if (isVirtual) {
        patchVirtualSession({ attachments: next }).catch(() => undefined);
        return;
      }
      setSessionAttachments(next);
    },
    [isVirtual, patchVirtualSession, setSessionAttachments],
  );
  const chatItems = useMemo(
    () => (isVirtual ? [] : (selectedSession?.transcript.items ?? [])),
    [isVirtual, selectedSession?.transcript],
  );
  const availableCommands = useMemo(
    () => (isVirtual ? (boundVirtualSession?.availableCommands ?? []) : (selectedSession?.availableCommands ?? [])),
    [boundVirtualSession?.availableCommands, isVirtual, selectedSession?.availableCommands],
  );
  const virtualConfigIndex =
    isVirtual && selectedLaunchTarget !== undefined ? getConfigOptionIndex(selectedLaunchTarget) : undefined;
  const virtualConfigValues = virtualSession?.configValues ?? {};
  const virtualSelectedModelId =
    typeof virtualConfigValues.model === 'string' ? virtualConfigValues.model : virtualConfigIndex?.defaultModelId;
  const configOptions = isVirtual
    ? optionsWithValues(rowForModel(virtualConfigIndex, virtualSelectedModelId), virtualConfigValues)
    : normalizeConfigOptions(selectedSession?.sessionConfiguration);
  const hasPendingInteraction =
    !isVirtual &&
    (selectedSession?.pendingElicitation !== undefined || selectedSession?.pendingPermission !== undefined);
  const pendingClientRequest = selectedSession?.pendingClientRequest !== undefined;
  const canCancelPromptTurn = !isVirtual && selectedSession?.pendingClientRequest === 'prompt';
  // Bind never locks the composer (optimistic, latest-wins); only Materialize (and handoff) does. A pending Send
  // freezes just the draft text / attachments, not provider or config controls.
  const virtualSendPending = isVirtual && sendPendingAtomValue;
  const chromeLocked = handoffInProgress || (isVirtual && materializing);
  const controlsEnabled = isVirtual
    ? !chromeLocked
    : selectedSession?.status === 'active' && !pendingClientRequest && !hasPendingInteraction && !chromeLocked;
  // Typing and attaching stay open mid-turn (and during config/interaction waits); only submit is gated.
  const canEdit = isVirtual
    ? !chromeLocked && !virtualSendPending
    : selectedSession?.status === 'active' && !chromeLocked;
  const virtualReady =
    isVirtual &&
    selectedLaunchTarget !== undefined &&
    selectedLaunchHarness.phase !== 'error' &&
    virtualSession?.cwd !== undefined;
  const hasSendableContent = draft.trim().length > 0 || attachments.length > 0;
  const canSend = isVirtual
    ? controlsEnabled && virtualReady && hasSendableContent && !virtualSendPending
    : controlsEnabled && selectedLaunchTarget !== undefined && hasSendableContent;
  const steeringSupported = hasSteeringSupport(backendSnapshot?.initializeResult);
  const hasTranscriptMessage = chatItems.some(
    item => item.kind === 'user_message' || item.kind === 'agent_message' || item.kind === 'agent_thought',
  );
  const canHandoffBase =
    !isVirtual &&
    controlsEnabled &&
    selectedLaunchTarget !== undefined &&
    selectedSessionId !== undefined &&
    hasTranscriptMessage &&
    sessionCwd !== undefined;
  const canForkBase =
    !isVirtual &&
    controlsEnabled &&
    selectedLaunchTarget !== undefined &&
    selectedSessionId !== undefined &&
    sessionCwd !== undefined &&
    hasSessionForkCapability(backendSnapshot?.initializeResult);

  const requestFork = useCallback((): Promise<unknown> | undefined => {
    if (
      selectedLaunchTarget === undefined ||
      selectedSessionId === undefined ||
      sessionCwd === undefined ||
      !canForkBase
    ) {
      return undefined;
    }
    return forkSession({
      cwd: sessionCwd,
      launchTarget: selectedLaunchTarget,
      sessionId: selectedSessionId,
    });
  }, [canForkBase, forkSession, selectedLaunchTarget, selectedSessionId, sessionCwd]);

  return {
    attachments,
    availableCommands,
    canCancelPromptTurn,
    canEdit,
    canForkBase,
    canHandoffBase,
    canSend,
    chatItems,
    chromeLocked,
    configOptions,
    controlsEnabled,
    draft,
    getConfigOptionIndex,
    hasPendingInteraction,
    initializeResult: selectedLaunchTarget !== undefined ? selectedLaunchHarness.initializeResult : undefined,
    isVirtual,
    pendingClientRequest,
    usableLaunchTargets,
    selectableLaunchTargets,
    unavailableReasons,
    requestFork,
    selectedLaunchTarget,
    selectedSession,
    selectedSessionId,
    setAttachments,
    setDraft,
    setVirtualLaunchTarget,
    steeringSupported,
    virtualSendPending,
  };
};
