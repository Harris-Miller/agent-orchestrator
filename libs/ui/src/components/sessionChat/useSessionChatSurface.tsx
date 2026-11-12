/**
 * The chat surface for the Selected target: the Composer model (draft, Composer action, edit / attach images / submit /
 * Prompt turn cancel) plus transcript, Config rows, provider picker data and Fork / Handoff gates.
 */
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { FC, ReactNode } from 'react';

import {
  configOptionIndexByLaunchTargetAtom,
  selectedAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionIdAtom,
} from '../../atoms/backendState.atoms.ts';
import {
  attachComposerImagesAtomFn,
  cancelPromptAtomFn,
  editComposerAtomFn,
  forkSessionAtomFn,
  launchTargetAvailabilityAtom,
  setVirtualLaunchTargetAtomFn,
  submitComposerAtomFn,
  unqueueComposerAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import { composerAtom } from '../../atoms/composer.atoms.ts';
import { hubAvailabilityAtom, sessionHubStatusesAtom } from '../../atoms/hub.atoms.ts';
import { useSelectedSessionFsListing } from '../../atoms/useSelectedSessionFsListing.ts';
import { virtualSessionAtom } from '../../atoms/virtualSession.atoms.ts';
import type { MidTurnSend } from '../../atoms/userSettings/userSettings.atoms.ts';
import type { SessionConfiguration } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';
import { optionsWithValues, rowForModel } from '../../host/configOptionIndexUi.ts';
import { hubUnavailableReason } from '../../host/hubSessions.ts';

/** Stable empty configuration, so memoized consumers do not re-run before the agent reports one. */
const EMPTY_CONFIGURATION: SessionConfiguration = [];

const useSessionChatSurfaceValue = (onClientError: (error: unknown) => void) => {
  const composer = useAtomValue(composerAtom);
  const isVirtual = useAtomValue(selectedAtom)?._tag === 'Virtual';
  const virtualSession = useAtomValue(virtualSessionAtom);
  const selectedSessionId = useAtomValue(selectedSessionIdAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const backendSnapshot = useAtomValue(selectedBackendHarnessSnapshotAtom);
  const { sessionCwd } = useSelectedSessionFsListing();
  const {
    reasons: unavailableReasons,
    selectable: selectableLaunchTargets,
    usable: usableLaunchTargets,
  } = useAtomValue(launchTargetAvailabilityAtom);
  const hubAvailability = useAtomValue(hubAvailabilityAtom);
  const sessionHubStatuses = useAtomValue(sessionHubStatusesAtom);
  const configOptionIndexes = useAtomValue(configOptionIndexByLaunchTargetAtom);
  const edit = useAtomSet(editComposerAtomFn);
  const attachImages = useAtomSet(attachComposerImagesAtomFn, { mode: 'promise' });
  const submitComposer = useAtomSet(submitComposerAtomFn, { mode: 'promise' });
  const unqueue = useAtomSet(unqueueComposerAtomFn, { mode: 'promise' });
  const cancelPrompt = useAtomSet(cancelPromptAtomFn, { mode: 'promise' });
  const setVirtualLaunchTarget = useAtomSet(setVirtualLaunchTargetAtomFn, { mode: 'promise' });
  const forkSession = useAtomSet(forkSessionAtomFn, { mode: 'promise' });

  const getConfigOptionIndex = useCallback(
    (launchTarget: AgentLaunchTarget) => configOptionIndexes[launchTarget],
    [configOptionIndexes],
  );

  const { target } = composer;
  const selectedLaunchTarget = target?.launchTarget;

  /** `mode` overrides the `midTurnSend` setting for this submit. */
  const submit = useCallback((mode?: MidTurnSend) => submitComposer(mode), [submitComposer]);
  const unqueueMessage = useCallback(() => unqueue(undefined), [unqueue]);
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
    : (selectedSession?.configuration ?? EMPTY_CONFIGURATION);
  const hasTranscriptMessage = chatItems.some(
    item => item.kind === 'user_message' || item.kind === 'agent_message' || item.kind === 'agent_thought',
  );
  const handoffUnavailableReason =
    selectedLaunchTarget === undefined || selectedSessionId === undefined
      ? undefined
      : hubUnavailableReason(hubAvailability, sessionHubStatuses, selectedLaunchTarget, selectedSessionId);
  const canHandoffBase =
    !isVirtual &&
    composer.controlsEnabled &&
    selectedLaunchTarget !== undefined &&
    selectedSessionId !== undefined &&
    hasTranscriptMessage &&
    sessionCwd !== undefined &&
    handoffUnavailableReason === undefined;
  const canForkBase =
    !isVirtual &&
    composer.controlsEnabled &&
    selectedLaunchTarget !== undefined &&
    selectedSessionId !== undefined &&
    sessionCwd !== undefined &&
    backendSnapshot?.agentCapabilities.sessionFork === true;

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
    handoffUnavailableReason,
    isVirtual,
    onClientError,
    requestFork,
    selectableLaunchTargets,
    selectedLaunchTarget,
    selectedSession,
    selectedSessionId,
    setVirtualLaunchTarget,
    cancelPromptTurn,
    submit,
    unavailableReasons,
    unqueueMessage,
    usableLaunchTargets,
  };
};

type SessionChatSurface = ReturnType<typeof useSessionChatSurfaceValue>;

const SessionChatSurfaceContext = createContext<SessionChatSurface | null>(null);

/** Computes the chat surface once per render; consumers read it via `useSessionChatSurface`. */
export const SessionChatSurfaceProvider: FC<{
  readonly children: ReactNode;
  readonly onClientError: (error: unknown) => void;
}> = ({ children, onClientError }) => {
  const value = useSessionChatSurfaceValue(onClientError);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- memoized over every field of `value`
  const memo = useMemo(() => value, Object.values(value));
  return <SessionChatSurfaceContext.Provider value={memo}>{children}</SessionChatSurfaceContext.Provider>;
};

export const useSessionChatSurface = (): SessionChatSurface => {
  const value = useContext(SessionChatSurfaceContext);
  if (value === null) {
    throw new Error('useSessionChatSurface must be used within a SessionChatSurfaceProvider');
  }
  return value;
};
