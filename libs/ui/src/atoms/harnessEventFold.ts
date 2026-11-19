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
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { applySessionUpdate } from '../host/applySessionUpdate.ts';
import type { BackendHarnessCallbacks } from '../host/backendHarness.ts';
import { mergeConfigOptionIndex } from '../host/configOptionIndexHydrate.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { newlyAdvertisedModelIds } from '../host/configOptionIndexUi.ts';
import { withNewModelsFirst } from '../host/modelPickerPrefs.ts';
import type { ModelPickerPrefs } from '../host/modelPickerPrefs.ts';
import { configOptionIndexIsNonempty } from '../host/configProbe.ts';
import {
  applyBootstrapPhase,
  applyInitializeResult,
  applySessionUpdatePatch,
  raiseElicitation,
  raisePermission,
  reconcileConnectionLost,
  setAntigravityAuthUrl,
} from '../host/harnessStateTransitions.ts';
import type { AttentionEvent } from '../host/notifyAttention.ts';
import { notifySessionAttention } from '../host/notifyAttention.ts';
import { redactRpcWireMessage } from '../host/rpcWireRedact.ts';
import { setSubagentParent } from '../host/sessionRpc.ts';
import { routeSubagentUpdate } from '../host/subagentRouting.ts';
import type { SubagentRouteResult } from '../host/subagentRouting.ts';

import { backendHarnessSnapshotAtom, configOptionIndexAtom } from './backendState.atoms.ts';
import { modifyHarnessSnapshot, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { onLaunchTargetConnectionLost } from './spawnedSubagent.ts';
import { linkOf } from './subagentLinkRegistry.ts';
import { beginSessionList } from './sessionLists.atoms.ts';
import { appendRpcWireEntry } from './rpcWireLog.ts';
import { currentUserSettings, modelPickerPrefsOf } from './userSettings/userSettingsDocument.atoms.ts';
import {
  bindVirtualOnUsable,
  resetVirtualUnsupportedConfig,
  unbindVirtualOnConnectionLost,
} from './virtualSession.atoms.ts';

export type HarnessEventFold = BackendHarnessCallbacks;

/** Applies one session/update; returns the Subagent link it established, if any. */
const routeAndApplySessionUpdate = (
  current: BackendHarnessSnapshot,
  sessionId: string,
  update: unknown,
): [SubagentRouteResult['linked'], BackendHarnessSnapshot] => {
  const routed = routeSubagentUpdate(current, sessionId, update);
  if (routed !== undefined) {
    return [routed.linked, routed.snapshot];
  }
  const result = applySessionUpdate(current.sessions[sessionId], sessionId, current.sessionHistory, update);
  if (result.kind === 'noop') {
    return [undefined, current];
  }
  return [undefined, applySessionUpdatePatch(current, result)];
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
  registry,
  runFork,
  setModelPickerPrefs,
}: {
  readonly launchTarget: AgentLaunchTarget;
  /** Writes this launch target's Hidden models + Model order (new models go on top, shown). */
  readonly setModelPickerPrefs: (prefs: ModelPickerPrefs) => void;
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
    raise: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot,
  ) => {
    const next = modifyHarnessSnapshot(registry, launchTarget, current => {
      const raised = raise(current);
      return [raised, raised];
    });
    // A Spawned subagent session is a root here, but the user knows it as a child: name it under its parent's title.
    const link = linkOf(registry, { launchTarget, sessionId });
    runFork(
      link === undefined
        ? notifySessionAttention(currentUserSettings(registry), next, launchTarget, sessionId, event)
        : notifySessionAttention(
            currentUserSettings(registry),
            registry.get(backendHarnessSnapshotAtom(link.parentLaunchTarget)),
            link.parentLaunchTarget,
            sessionId,
            event,
          ),
    );
  };

  // Snapshotted just before the startup list request so a pin made while it is in flight is never swept.

  return {
    hasConfigOptionIndex: () => configOptionIndexIsNonempty(registry.get(configOptionIndexAtom(launchTarget))),
    onAntigravityAuthUrl: url => {
      update(current => setAntigravityAuthUrl(current, url));
    },
    onConfigIndexEvent: event => {
      const previous = registry.get(configOptionIndexAtom(launchTarget));
      const next = mergeConfigOptionIndex(previous, event);
      if (next !== undefined && next !== previous) {
        publishConfigOptionIndex(next);
        const added = newlyAdvertisedModelIds(previous, next);
        if (added.length > 0) {
          setModelPickerPrefs(
            withNewModelsFirst(modelPickerPrefsOf(currentUserSettings(registry), launchTarget), added),
          );
        }
      }
    },
    onConfigOptionIndexPublish: publishConfigOptionIndex,
    onConnectionLost: () => {
      const lost = modifyHarnessSnapshot(registry, launchTarget, current => [
        current,
        reconcileConnectionLost(current),
      ]);
      cancelPendingRequests(lost);
      runFork(onLaunchTargetConnectionLost(registry, launchTarget));
      unbindVirtualOnConnectionLost(registry, launchTarget);
    },
    onElicitationCreate: (sessionId, request, resolve) => {
      const pending = { id: crypto.randomUUID(), request, resolve, sessionId };
      setPending(sessionId, { kind: 'elicitation' }, current => raiseElicitation(current, pending));
    },
    onInitializeResult: initializeResult => {
      update(current => applyInitializeResult(current, launchTarget, initializeResult));
    },
    onPermissionRequest: (sessionId, request, resolve) => {
      setPending(sessionId, { kind: 'permission' }, current =>
        raisePermission(current, { request, resolve, sessionId }),
      );
    },
    onPhase: (phase, failure) => {
      update(current => applyBootstrapPhase(current, phase, failure));
      if (phase === 'usable') {
        runFork(
          bindVirtualOnUsable(registry, launchTarget).pipe(
            Effect.catchCause(cause => Effect.logWarning('bindVirtualOnUsable failed', launchTarget, cause)),
          ),
        );
      }
    },
    onRpcMessage: (direction, message) => {
      appendRpcWireEntry(registry, launchTarget, {
        direction,
        id: crypto.randomUUID(),
        message: redactRpcWireMessage(message),
        receivedAt: Date.now(),
      });
    },
    onSessionListBegin: cwd => beginSessionList(registry, launchTarget, cwd, runFork),
    onSessionUpdate: (sessionId, sessionUpdate) => {
      const linked = modifyHarnessSnapshot(registry, launchTarget, current =>
        routeAndApplySessionUpdate(current, sessionId, sessionUpdate),
      );
      if (linked !== undefined) {
        setSubagentParent(launchTarget, linked.childId, linked.parentId);
      }
    },
  };
};
