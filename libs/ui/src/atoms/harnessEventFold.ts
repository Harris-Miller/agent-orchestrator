/**
 * Harness event fold: the one consumer of what a Backend harness reports for its launch target (including its Backend
 * connection's Lazy-hydrate events and Connection lost). Folds each report into the latest Backend harness snapshot
 * (atomically) and carries out its consequences — a Subagent session's parent recorded for
 * turn-correlated tracing, Attention events, the `usable` Bind, pin reconcile, Config option index publish, and on
 * Connection lost: pending interactions cancelled and the Virtual session unbound. Consequences run fire-and-forget
 * through `runFork` and never fail the fold.
 */
import { writeConfigOptionIndexCache } from '@lib/hoa-home';
import type { HostServices } from '@lib/context-services';
import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { isUsablePhase } from '../host/acpSessionBootstrap.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { applySessionUpdate } from '../host/applySessionUpdate.ts';
import type { BackendHarnessCallbacks } from '../host/backendHarness.ts';
import { mergeConfigOptionIndex } from '../host/configOptionIndexHydrate.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { configOptionIndexIsNonempty } from '../host/configProbe.ts';
import { applyInitializeResult, historyAfterList, reconcileConnectionLost } from '../host/harnessStateTransitions.ts';
import type { AttentionEvent } from '../host/notifyAttention.ts';
import { notifySessionAttention } from '../host/notifyAttention.ts';
import { setSubagentParent } from '../host/sessionRpc.ts';
import { upsertSession } from '../host/sessionSnapshot.ts';
import { patchSessionOrSubagent, routeSubagentUpdate } from '../host/subagentRouting.ts';
import type { SubagentRouteResult } from '../host/subagentRouting.ts';

import { configOptionIndexAtom } from './backendState.atoms.ts';
import { modifyHarnessSnapshot, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { pinnedSessionsAtom, reconcilePinsAfterList } from './pinnedSessions.atoms.ts';
import type { RefreshSessionFsListing } from './sessionFsListing.atoms.ts';
import { currentUserSettings } from './userSettings/userSettingsDocument.atoms.ts';
import {
  bindVirtualOnUsable,
  resetVirtualUnsupportedConfig,
  unbindVirtualOnConnectionLost,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

export type HarnessEventFold = BackendHarnessCallbacks;

/** What one session/update changed beyond the snapshot. */
type SessionUpdateConsequences = {
  readonly linked?: SubagentRouteResult['linked'];
};

const routeAndApplySessionUpdate = (
  current: BackendHarnessSnapshot,
  sessionId: string,
  update: unknown,
): [SessionUpdateConsequences, BackendHarnessSnapshot] => {
  const routed = routeSubagentUpdate(current, sessionId, update);
  if (routed !== undefined) {
    return [{ linked: routed.linked }, routed.snapshot];
  }
  const result = applySessionUpdate(current.sessions[sessionId], sessionId, current.sessionHistory, update);
  if (result.kind === 'noop') {
    return [{}, current];
  }
  return [
    {},
    {
      ...current,
      sessionHistory: result.sessionHistory ?? current.sessionHistory,
      sessions: upsertSession(current.sessions, result.session),
    },
  ];
};

/** Resolve outstanding permission / elicitation requests as cancelled so no agent-side promise is left dangling. */
const cancelPendingRequests = (snapshot: BackendHarnessSnapshot): void => {
  for (const session of [...Object.values(snapshot.sessions), ...Object.values(snapshot.subagents)]) {
    session.pendingPermission?.resolve({ outcome: { outcome: 'cancelled' } });
    session.pendingElicitation?.resolve({ action: 'cancel' });
  }
};

export const makeHarnessEventFold = ({
  launchTarget,
  refreshFsListing,
  registry,
  runFork,
}: {
  readonly launchTarget: AgentLaunchTarget;
  readonly refreshFsListing: RefreshSessionFsListing;
  readonly registry: AtomRegistry.AtomRegistry;
  readonly runFork: (effect: Effect.Effect<unknown, never, HostServices>) => void;
}): HarnessEventFold => {
  const update = (transition: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot) => {
    updateHarnessSnapshot(registry, launchTarget, transition);
  };

  const publishConfigOptionIndex = (index: ConfigOptionIndex) => {
    registry.set(configOptionIndexAtom(launchTarget), index);
    resetVirtualUnsupportedConfig(registry, launchTarget, index);
    runFork(
      writeConfigOptionIndexCache(toLaunchTarget(launchTarget), index).pipe(
        Effect.catchCause(cause => Effect.logWarning('config option index persist failed', launchTarget, cause)),
      ),
    );
  };

  /** Place a pending interaction on its session or subagent child, then raise its Attention event. */
  const setPending = (
    sessionId: string,
    event: AttentionEvent,
    patch: Parameters<typeof patchSessionOrSubagent>[2],
  ) => {
    const next = modifyHarnessSnapshot(registry, launchTarget, current => {
      const patched = patchSessionOrSubagent(current, sessionId, patch);
      return [patched, patched];
    });
    runFork(notifySessionAttention(currentUserSettings(registry), next, launchTarget, sessionId, event));
  };

  // Snapshotted just before the startup list request so a pin made while it is in flight is never swept.
  let pinsBeforeStartupList = registry.get(pinnedSessionsAtom(launchTarget));

  return {
    hasConfigOptionIndex: () => configOptionIndexIsNonempty(registry.get(configOptionIndexAtom(launchTarget))),
    onAntigravityAuthUrl: url => {
      update(current => ({ ...current, antigravityAuthUrl: url }));
    },
    onConfigIndexEvent: event => {
      const previous = registry.get(configOptionIndexAtom(launchTarget));
      const next = mergeConfigOptionIndex(previous, event);
      if (next !== undefined && next !== previous) {
        publishConfigOptionIndex(next);
      }
    },
    onConfigOptionIndexPublish: publishConfigOptionIndex,
    onConnectionLost: () => {
      const lost = modifyHarnessSnapshot(registry, launchTarget, current => [
        current,
        reconcileConnectionLost(current),
      ]);
      cancelPendingRequests(lost);
      unbindVirtualOnConnectionLost(registry, launchTarget);
    },
    onElicitationCreate: (sessionId, request, resolve) => {
      setPending(sessionId, { kind: 'elicitation' }, holder => ({
        ...holder,
        pendingElicitation: { id: crypto.randomUUID(), request, resolve, sessionId },
      }));
    },
    onInitializeResult: initializeResult => {
      update(current => applyInitializeResult(current, launchTarget, initializeResult));
    },
    onPermissionRequest: (sessionId, request, resolve) => {
      setPending(sessionId, { kind: 'permission' }, holder => ({
        ...holder,
        pendingPermission: { request, resolve, sessionId },
      }));
    },
    onPhase: (phase, failure) => {
      update(current => ({
        ...current,
        ...(isUsablePhase(phase) || phase === 'error' || phase === 'connecting'
          ? { antigravityAuthUrl: undefined }
          : {}),
        failure,
        phase,
      }));
      if (phase === 'usable') {
        runFork(
          bindVirtualOnUsable(registry, launchTarget, refreshFsListing).pipe(
            Effect.catchCause(cause => Effect.logWarning('bindVirtualOnUsable failed', launchTarget, cause)),
          ),
        );
      }
    },
    onRpcMessage: (direction, message) => {
      update(current => ({
        ...current,
        rpcCalls: [...current.rpcCalls, { direction, id: crypto.randomUUID(), message, receivedAt: Date.now() }],
      }));
    },
    onSessionHistoryRequest: () => {
      pinsBeforeStartupList = registry.get(pinnedSessionsAtom(launchTarget));
    },
    onSessionHistoryResult: (listResult, scope) => {
      const boundSessionId = registry.get(virtualSessionAtom)?.sessionId;
      update(current => ({
        ...current,
        sessionHistory: historyAfterList(current.sessionHistory, listResult, scope, boundSessionId),
      }));
      runFork(reconcilePinsAfterList(registry, launchTarget, pinsBeforeStartupList, listResult, scope));
    },
    onSessionUpdate: (sessionId, sessionUpdate) => {
      const { linked } = modifyHarnessSnapshot(registry, launchTarget, current =>
        routeAndApplySessionUpdate(current, sessionId, sessionUpdate),
      );
      if (linked !== undefined) {
        setSubagentParent(launchTarget, linked.childId, linked.parentId);
      }
    },
  };
};
