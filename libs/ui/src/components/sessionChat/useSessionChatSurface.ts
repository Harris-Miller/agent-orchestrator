/**
 * The chat surface for the Selected target: the Composer model (draft, Composer action, edit / attach images / submit /
 * Prompt turn cancel) plus transcript, Config rows, provider picker data and Fork / Handoff gates.
 */
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { useCallback, useMemo } from 'react';

import {
  configOptionIndexByLaunchTargetAtom,
  launchTargetUnavailableReasonsAtom,
  pickerLaunchTargetsAtom,
  selectedAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
  usableLaunchTargetsAtom,
} from '../../atoms/backendState.atoms.ts';
import {
  attachComposerImagesAtomFn,
  cancelPromptAtomFn,
  editComposerAtomFn,
  forkSessionAtomFn,
  providerViewsAtom,
  setVirtualLaunchTargetAtomFn,
  submitComposerAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import { composerAtom } from '../../atoms/composer.atoms.ts';
import { useSelectedSessionFsListing } from '../../atoms/useSelectedSessionFsListing.ts';
import { virtualSessionAtom } from '../../atoms/virtualSession.atoms.ts';
import { hasSessionForkCapability, normalizeConfigOptions } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { optionsWithValues, rowForModel } from '../../host/configOptionIndexUi.ts';
import { unavailableReason } from '../../host/providerView.ts';

export const useSessionChatSurface = () => {
  const composer = useAtomValue(composerAtom);
  const isVirtual = useAtomValue(selectedAtom)?._tag === 'Virtual';
  const virtualSession = useAtomValue(virtualSessionAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const { sessionCwd } = useSelectedSessionFsListing();
  const usableLaunchTargets = useAtomValue(usableLaunchTargetsAtom);
  const selectableLaunchTargets = useAtomValue(pickerLaunchTargetsAtom);
  const harnessReasons = useAtomValue(launchTargetUnavailableReasonsAtom);
  const providers = useAtomValue(providerViewsAtom);
  const configOptionIndexes = useAtomValue(configOptionIndexByLaunchTargetAtom);
  const edit = useAtomSet(editComposerAtomFn);
  const attachImages = useAtomSet(attachComposerImagesAtomFn, { mode: 'promise' });
  const submitComposer = useAtomSet(submitComposerAtomFn, { mode: 'promise' });
  const cancelPrompt = useAtomSet(cancelPromptAtomFn, { mode: 'promise' });
  const setVirtualLaunchTarget = useAtomSet(setVirtualLaunchTargetAtomFn, { mode: 'promise' });
  const forkSession = useAtomSet(forkSessionAtomFn, { mode: 'promise' });

  const unavailableReasons = useMemo(() => {
    const reasons = { ...harnessReasons };
    for (const provider of providers) {
      const reason = unavailableReason(provider);
      if (reason !== undefined) reasons[provider.id] = reason;
    }
    return reasons;
  }, [harnessReasons, providers]);

  const getConfigOptionIndex = useCallback(
    (launchTarget: AgentLaunchTarget) => configOptionIndexes[launchTarget],
    [configOptionIndexes],
  );

  const { target } = composer;
  const selectedLaunchTarget = target?.launchTarget;

  const submit = useCallback(() => submitComposer(undefined), [submitComposer]);
  const cancelPromptTurn = useCallback((): Promise<unknown> | undefined => {
    if (target?._tag !== 'Session' || target.launchTarget === undefined || composer.action._tag !== 'CancelTurn') {
      return undefined;
    }
    return cancelPrompt({ launchTarget: target.launchTarget, sessionId: target.sessionId });
  }, [cancelPrompt, composer.action._tag, target]);

  const chatItems = useMemo(
    () => (isVirtual ? [] : (selectedSession?.transcript.items ?? [])),
    [isVirtual, selectedSession?.transcript],
  );
  const virtualConfigIndex =
    isVirtual && selectedLaunchTarget !== undefined ? getConfigOptionIndex(selectedLaunchTarget) : undefined;
  const virtualConfigValues = virtualSession?.configValues ?? {};
  const virtualSelectedModelId =
    typeof virtualConfigValues.model === 'string' ? virtualConfigValues.model : virtualConfigIndex?.defaultModelId;
  const configOptions = isVirtual
    ? optionsWithValues(rowForModel(virtualConfigIndex, virtualSelectedModelId), virtualConfigValues)
    : normalizeConfigOptions(selectedSession?.sessionConfiguration);
  const hasTranscriptMessage = chatItems.some(
    item => item.kind === 'user_message' || item.kind === 'agent_message' || item.kind === 'agent_thought',
  );
  const canHandoffBase =
    !isVirtual &&
    composer.controlsEnabled &&
    selectedLaunchTarget !== undefined &&
    selectedSessionId !== undefined &&
    hasTranscriptMessage &&
    sessionCwd !== undefined;
  const canForkBase =
    !isVirtual &&
    composer.controlsEnabled &&
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
    attachImages,
    canForkBase,
    canHandoffBase,
    chatItems,
    composer,
    configOptions,
    edit,
    getConfigOptionIndex,
    isVirtual,
    requestFork,
    selectableLaunchTargets,
    selectedLaunchTarget,
    selectedSession,
    selectedSessionId,
    setVirtualLaunchTarget,
    cancelPromptTurn,
    submit,
    unavailableReasons,
    usableLaunchTargets,
  };
};
