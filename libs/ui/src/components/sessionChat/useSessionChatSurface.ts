/** Derived Virtual-vs-Session composer surface — one branch instead of scattered isVirtual ternaries. */
import { useAtom, useAtomSet, useAtomValue } from '@effect/atom-react';
import { useCallback, useMemo } from 'react';

import {
  configOptionIndexAtom,
  readyLaunchTargetsAtom,
  selectedAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  selectedSessionLaunchTargetAtom,
  virtualMaterializeInFlightAtom,
} from '../../atoms/backendState.atoms.ts';
import { patchVirtualSessionAtomFn, setVirtualLaunchTargetAtomFn } from '../../atoms/boundHarnessAtoms.ts';
import { draftAtom } from '../../atoms/chat.atoms.ts';
import { handoffInProgressAtom } from '../../atoms/handoff.atoms.ts';
import { useSelectedSessionFsListing } from '../../atoms/useSelectedSessionFsListing.ts';
import { virtualSessionAtom } from '../../atoms/virtualSession.atoms.ts';
import { hasSessionForkCapability, normalizeConfigOptions } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { optionsWithValues, rowForModel } from '../../host/configOptionIndexUi.ts';

export const useSessionChatSurface = () => {
  const selected = useAtomValue(selectedAtom);
  const isVirtual = selected?._tag === 'Virtual';
  const virtualSession = useAtomValue(virtualSessionAtom);
  const selectedLaunchTargetFromSession = useAtomValue(selectedSessionLaunchTargetAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const draftSessionId = selectedSessionId ?? '';
  const [sessionDraft, setSessionDraft] = useAtom(draftAtom(draftSessionId));
  const selectedSession = useAtomValue(selectedSessionAtom);
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const handoffInProgress = useAtomValue(handoffInProgressAtom);
  const virtualMaterializeInFlight = useAtomValue(virtualMaterializeInFlightAtom);
  const { sessionCwd, sourceCwd } = useSelectedSessionFsListing();
  const readyLaunchTargets = useAtomValue(readyLaunchTargetsAtom);
  const claudeConfigIndex = useAtomValue(configOptionIndexAtom('claude-agent-acp'));
  const codexConfigIndex = useAtomValue(configOptionIndexAtom('codex-acp'));
  const geminiConfigIndex = useAtomValue(configOptionIndexAtom('gemini-acp'));
  const patchVirtualSession = useAtomSet(patchVirtualSessionAtomFn, { mode: 'promise' });
  const setVirtualLaunchTarget = useAtomSet(setVirtualLaunchTargetAtomFn, { mode: 'promise' });

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

  const selectedLaunchTarget = isVirtual ? virtualSession?.launchTarget : selectedLaunchTargetFromSession;
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
    () => (isVirtual ? [] : (selectedSession?.availableCommands ?? [])),
    [isVirtual, selectedSession?.availableCommands],
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
  const chromeLocked = handoffInProgress || virtualMaterializeInFlight;
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
    selectedLaunchTarget,
    selectedSession,
    selectedSessionId,
    setDraft,
    setVirtualLaunchTarget,
    sourceCwd,
    virtualConfigIndex,
    virtualConfigValues,
    virtualMaterializeInFlight,
  };
};
