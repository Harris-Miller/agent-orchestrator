/**
 * Harness event fold: the one consumer of what a Backend harness reports for its launch target. Folds each report
 * into the latest Backend harness snapshot (atomically) and carries out its consequences — Usage persisted, a
 * Subagent session's parent recorded for turn-correlated tracing, Attention events, the `usable` Bind, pin reconcile,
 * Config option index publish. Consequences run fire-and-forget through `runFork` and never fail the fold.
 */
import { deleteSessionDir, writeConfigOptionIndexCache, writeSessionUsage } from '@lib/ao-home';
import type { SessionUsageDocument } from '@lib/ao-home';
import type { HostServices } from '@lib/context-services';
import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { isUsablePhase } from '../host/acpSessionBootstrap.ts';
import { toLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { applySessionUpdate } from '../host/applySessionUpdate.ts';
import type { BackendHarnessCallbacks } from '../host/backendHarness.ts';
import type { ConfigIndexEvent } from '../host/configOptionIndexHydrate.ts';
import { mergeConfigOptionIndex } from '../host/configOptionIndexHydrate.ts';
import { resetUnsupportedConfigValues } from '../host/configOptionIndexUi.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { configOptionIndexIsNonempty } from '../host/configProbe.ts';
import { historyAfterList } from '../host/harnessStateTransitions.ts';
import type { AttentionEvent } from '../host/notifyAttention.ts';
import { notifySessionAttention } from '../host/notifyAttention.ts';
import { setSubagentParent } from '../host/promptSpanRegistry.ts';
import { upsertSession } from '../host/sessionSnapshot.ts';
import { patchSessionOrSubagent, routeSubagentUpdate } from '../host/subagentRouting.ts';
import type { SubagentRouteResult } from '../host/subagentRouting.ts';

import { configOptionIndexAtom } from './backendState.atoms.ts';
import { modifyHarnessSnapshot, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { pinnedSessionsAtom, reconcilePinsAfterList } from './pinnedSessions.atoms.ts';
import type { RefreshSessionFsListing } from './virtualBind.ts';
import { ensureVirtualAcpBound, rwFromRegistry } from './virtualBind.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

export type HarnessEventFold = BackendHarnessCallbacks & {
  /** Lazy hydrate sink: fold one live ACP response into the Config option index. */
  readonly onConfigIndexEvent: (event: ConfigIndexEvent) => void;
};

/** What one session/update changed beyond the snapshot. */
type SessionUpdateConsequences = {
  readonly linked?: SubagentRouteResult['linked'];
  readonly usage?: SessionUsageDocument;
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
    { usage: result.usageChanged ? result.session.usage : undefined },
    {
      ...current,
      sessionHistory: result.sessionHistory ?? current.sessionHistory,
      sessions: upsertSession(current.sessions, result.session),
    },
  ];
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

  const resetVirtualConfig = (index: ConfigOptionIndex) => {
    const virtual = registry.get(virtualSessionAtom);
    if (virtual?.launchTarget !== launchTarget) return;
    registry.set(virtualSessionAtom, {
      ...virtual,
      configValues: resetUnsupportedConfigValues(index, virtual.configValues),
    });
  };

  const publishConfigOptionIndex = (index: ConfigOptionIndex) => {
    registry.set(configOptionIndexAtom(launchTarget), index);
    resetVirtualConfig(index);
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
    runFork(notifySessionAttention(next, launchTarget, sessionId, event));
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
    onElicitationCreate: (sessionId, request, resolve) => {
      setPending(sessionId, { kind: 'elicitation' }, holder => ({
        ...holder,
        pendingElicitation: { id: crypto.randomUUID(), request, resolve, sessionId },
      }));
    },
    onInitializeResult: initializeResult => {
      update(current => ({ ...current, initializeResult, phase: 'initialized' }));
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
      // Sole non-mutator Bind trigger (mutator side: mutateVirtualThenRebind).
      if (phase === 'usable' && registry.get(virtualSessionAtom)?.launchTarget === launchTarget) {
        runFork(
          ensureVirtualAcpBound(rwFromRegistry(registry), refreshFsListing).pipe(
            Effect.catchCause(cause =>
              Effect.logWarning('ensureVirtualAcpBound on usable failed', launchTarget, cause),
            ),
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
      runFork(reconcilePinsAfterList(rwFromRegistry(registry), launchTarget, pinsBeforeStartupList, listResult, scope));
    },
    onSessionUpdate: (sessionId, sessionUpdate) => {
      const { linked, usage } = modifyHarnessSnapshot(registry, launchTarget, current =>
        routeAndApplySessionUpdate(current, sessionId, sessionUpdate),
      );
      if (linked !== undefined) {
        setSubagentParent(launchTarget, linked.childId, linked.parentId);
        if (linked.migratedRoot) {
          runFork(
            deleteSessionDir(linked.childId).pipe(
              Effect.catchCause(cause => Effect.logWarning('stray usage cleanup failed', cause)),
            ),
          );
        }
      }
      if (usage !== undefined) {
        runFork(
          writeSessionUsage(sessionId, usage).pipe(
            Effect.catchCause(cause => Effect.logWarning('session usage persist failed', sessionId, cause)),
          ),
        );
      }
    },
  };
};
