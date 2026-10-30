/** Derived Virtual-vs-Session composer surface — one branch instead of scattered isVirtual ternaries. */
import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import { useCallback, useMemo } from 'react';

import {
  backendHarnessStateAtom,
  configOptionIndexAtom,
  readyLaunchTargetsAtom,
  selectableLaunchTargetsAtom,
  selectedAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  virtualLifecycleInFlightAtom,
} from '../../atoms/backendState.atoms.ts';
import {
  forkSessionAtomFn,
  patchVirtualSessionAtomFn,
  setVirtualLaunchTargetAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import { composerAttachmentsAtom, draftAtom } from '../../atoms/chat.atoms.ts';
import { handoffInProgressAtom } from '../../atoms/handoff.atoms.ts';
import {
  selectedActiveSessionAtom,
  selectedVirtualBoundSessionIdAtom,
} from '../../atoms/selectedActiveSession.atoms.ts';
import { useSelectedSessionFsListing } from '../../atoms/useSelectedSessionFsListing.ts';
import { virtualSessionAtom } from '../../atoms/virtualSession.atoms.ts';
import { hasSessionForkCapability, normalizeConfigOptions } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import type { ComposerImageAttachment } from '../../host/composerImageAttachment.ts';
import { optionsWithValues, rowForModel } from '../../host/configOptionIndexUi.ts';

export const useSessionChatSurface = () => {
  const selected = useAtomValue(selectedAtom);
  const isVirtual = selected?._tag === 'Virtual';
  const virtualSession = useAtomValue(virtualSessionAtom);
  const virtualBoundSessionId = useAtomValue(selectedVirtualBoundSessionIdAtom);
  const activeSession = useAtomValue(selectedActiveSessionAtom);
  const selectedLaunchTargetFromSession = useAtomValue(selectedSessionLaunchTargetAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const draftSessionId = selectedSessionId ?? '';
  const [sessionDraft, setSessionDraft] = useAtom(draftAtom(draftSessionId));
  const [sessionAttachments, setSessionAttachments] = useAtom(composerAttachmentsAtom(draftSessionId));
  const selectedSession = useAtomValue(selectedSessionAtom);
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const handoffInProgress = useAtomValue(handoffInProgressAtom);
  const virtualLifecycleInFlight = useAtomValue(virtualLifecycleInFlightAtom);
  const { sessionCwd } = useSelectedSessionFsListing();
  const readyLaunchTargets = useAtomValue(readyLaunchTargetsAtom);
  const selectableLaunchTargets = useAtomValue(selectableLaunchTargetsAtom);
  const claudeConfigIndex = useAtomValue(configOptionIndexAtom('claude-agent-acp'));
  const codexConfigIndex = useAtomValue(configOptionIndexAtom('codex-acp'));
  const cursorConfigIndex = useAtomValue(configOptionIndexAtom('cursor-acp'));
  const antigravityConfigIndex = useAtomValue(configOptionIndexAtom('antigravity-acp'));
  const patchVirtualSession = useAtomSet(patchVirtualSessionAtomFn, { mode: 'promise' });
  const setVirtualLaunchTarget = useAtomSet(setVirtualLaunchTargetAtomFn, { mode: 'promise' });
  const forkSession = useAtomSet(forkSessionAtomFn, { mode: 'promise' });

  const selectedLaunchTarget = isVirtual ? virtualSession?.launchTarget : selectedLaunchTargetFromSession;
  const activeBackendSnapshot = useAtomValue(backendHarnessStateAtom(activeSession?.launchTarget ?? 'codex-acp'));
  const selectedLaunchHarness = useAtomValue(
    backendHarnessStateAtom(selectedLaunchTarget ?? activeSession?.launchTarget ?? 'codex-acp'),
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
  const chromeLocked = handoffInProgress || virtualLifecycleInFlight;
  const controlsEnabled = isVirtual
    ? !chromeLocked
    : selectedSession?.status === 'active' && !pendingClientRequest && !hasPendingInteraction && !chromeLocked;
  const virtualReady =
    isVirtual &&
    selectedLaunchTarget !== undefined &&
    readyLaunchTargets.includes(selectedLaunchTarget) &&
    virtualSession?.cwd !== undefined;
  const hasSendableContent = draft.trim().length > 0 || attachments.length > 0;
  const canSend = isVirtual
    ? controlsEnabled && virtualReady && hasSendableContent
    : controlsEnabled && selectedLaunchTarget !== undefined && hasSendableContent;
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
    readyLaunchTargets,
    selectableLaunchTargets,
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
  };
};
