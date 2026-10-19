/** Derived Virtual-vs-Session composer surface — one branch instead of scattered isVirtual ternaries. */
import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import { useCallback, useMemo } from 'react';

import {
  backendHarnessStateAtom,
  configOptionIndexAtom,
  readyLaunchTargetsAtom,
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
import { draftAtom } from '../../atoms/chat.atoms.ts';
import { handoffInProgressAtom } from '../../atoms/handoff.atoms.ts';
import { useSelectedSessionFsListing } from '../../atoms/useSelectedSessionFsListing.ts';
import {
  selectedActiveSessionAtom,
  selectedVirtualBoundSessionIdAtom,
  virtualSessionAtom,
} from '../../atoms/virtualSession.atoms.ts';
import { hasSessionForkCapability, normalizeConfigOptions } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
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
  const selectedSession = useAtomValue(selectedSessionAtom);
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const handoffInProgress = useAtomValue(handoffInProgressAtom);
  const virtualLifecycleInFlight = useAtomValue(virtualLifecycleInFlightAtom);
  const { sessionCwd, sourceCwd } = useSelectedSessionFsListing();
  const readyLaunchTargets = useAtomValue(readyLaunchTargetsAtom);
  const claudeConfigIndex = useAtomValue(configOptionIndexAtom('claude-agent-acp'));
  const codexConfigIndex = useAtomValue(configOptionIndexAtom('codex-acp'));
  const geminiConfigIndex = useAtomValue(configOptionIndexAtom('gemini-acp'));
  const patchVirtualSession = useAtomSet(patchVirtualSessionAtomFn, { mode: 'promise' });
  const setVirtualLaunchTarget = useAtomSet(setVirtualLaunchTargetAtomFn, { mode: 'promise' });
  const forkSession = useAtomSet(forkSessionAtomFn, { mode: 'promise' });

  const selectedLaunchTarget = isVirtual ? virtualSession?.launchTarget : selectedLaunchTargetFromSession;
  const activeBackendSnapshot = useAtomValue(backendHarnessStateAtom(activeSession?.launchTarget ?? 'codex-acp'));
  const boundVirtualSession =
    isVirtual && activeSession !== undefined ? activeBackendSnapshot.sessions[activeSession.sessionId] : undefined;

  const getConfigOptionIndex = useCallback(
    (launchTarget: AgentLaunchTarget) => {
      switch (launchTarget) {
        case 'claude-agent-acp':
          return claudeConfigIndex;
        case 'codex-acp':
          return codexConfigIndex;
        case 'gemini-acp':
          return geminiConfigIndex;
      }
    },
    [claudeConfigIndex, codexConfigIndex, geminiConfigIndex],
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
  const canSend = isVirtual
    ? controlsEnabled && virtualReady && draft.trim().length > 0
    : controlsEnabled && selectedLaunchTarget !== undefined && draft.trim().length > 0;
  const hasTranscriptMessage = chatItems.some(item => item.kind === 'user_message' || item.kind === 'agent_message');
  const canHandoffBase =
    !isVirtual &&
    controlsEnabled &&
    selectedLaunchTarget !== undefined &&
    selectedSessionId !== undefined &&
    hasTranscriptMessage &&
    sourceCwd !== undefined;
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
    isVirtual,
    pendingClientRequest,
    readyLaunchTargets,
    requestFork,
    selectedLaunchTarget,
    selectedSession,
    selectedSessionId,
    setDraft,
    setVirtualLaunchTarget,
    sourceCwd,
    virtualBoundSessionId,
    virtualConfigIndex,
    virtualConfigValues,
    virtualLifecycleInFlight,
  };
};
