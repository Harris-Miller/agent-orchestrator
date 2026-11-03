/** ACP backend harness lifecycle Atoms (mount + restart). */
import { writeConfigOptionIndexCache, writeSessionUsage } from '@lib/ao-home';
import type { LaunchTarget } from '@lib/ao-home';
import type { HostServices } from '@lib/context-services';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { applySessionUpdate } from '../host/applySessionUpdate.ts';
import { resetUnsupportedConfigValues } from '../host/configOptionIndexUi.ts';
import { cancelPendingRequests, reconcileStoppedProvider } from '../host/harnessStateTransitions.ts';
import { makeBackendLifecycle } from '../host/backendLifecycle.ts';
import { requestAntigravitySignIn, resetBackendHarnessState, runBackendHarness } from '../host/backendHarness.ts';
import { patchSession, upsertSession } from '../host/sessionSnapshot.ts';

import {
  backendDesiredStateAtom,
  backendHarnessStateAtom,
  clearSelectedSessionIfMissing,
  configOptionIndexAtom,
} from './backendState.atoms.ts';
import type { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { ensureVirtualAcpBound, historyAfterList, refreshFsListingViaRegistry, rwFromRegistry } from './virtualBind.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

type RefreshSessionFsListingAtomFn = ReturnType<typeof createSessionFsListingAtoms>['refreshSessionFsListingAtomFn'];

export const createHarnessAtoms = (
  runtime: HostRuntimeBag,
  refreshSessionFsListingAtomFn: RefreshSessionFsListingAtomFn,
) => {
  const { atomRuntime, hostRunFork } = runtime;

  /** Single owner of provider process lifetime: atoms never own it, so remount cannot duplicate a backend. */
  const lifecycle = makeBackendLifecycle<HostServices>(effect => hostRunFork(effect));

  const backendHarnessAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
    Atom.make(get => {
      // Disabled / stopping providers never spawn from a remount or retry; only an explicit running + start does.
      if (get(backendDesiredStateAtom(launchTarget)) === 'stopped') {
        return;
      }
      const { registry } = get;
      const updateState = (patch: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot) => {
        registry.update(backendHarnessStateAtom(launchTarget), patch);
      };

      const resetVirtualConfig = (index: ConfigOptionIndex) => {
        const virtual = registry.get(virtualSessionAtom);
        if (virtual?.launchTarget !== launchTarget) return;
        registry.set(virtualSessionAtom, {
          ...virtual,
          configValues: resetUnsupportedConfigValues(index, virtual.configValues),
        });
      };

      const persistConfigOptionIndex = (index: ConfigOptionIndex) => {
        hostRunFork(
          writeConfigOptionIndexCache(launchTarget as LaunchTarget, index).pipe(
            Effect.catchCause(cause => Effect.logWarning('config option index persist failed', launchTarget, cause)),
          ),
        );
      };

      lifecycle.start(
        launchTarget,
        runBackendHarness(
          launchTarget,
          {
            onAntigravityAuthUrl: url => {
              updateState(current => ({
                ...current,
                antigravityAuthUrl: url,
              }));
            },
            onConfigOptionIndexPublish: index => {
              registry.set(configOptionIndexAtom(launchTarget), index);
              resetVirtualConfig(index);
              persistConfigOptionIndex(index);
            },
            onElicitationCreate: (sessionId, request, resolve) => {
              updateState(current => ({
                ...current,
                sessions: patchSession(current.sessions, sessionId, session => ({
                  ...session,
                  pendingElicitation: { request, resolve, sessionId },
                })),
              }));
            },
            onInitializeResult: initializeResult => {
              updateState(current => ({
                ...current,
                initializeResult,
                phase: 'initialized',
              }));
            },
            onPermissionRequest: (sessionId, request, resolve) => {
              updateState(current => ({
                ...current,
                sessions: patchSession(current.sessions, sessionId, session => ({
                  ...session,
                  pendingPermission: { request, resolve, sessionId },
                })),
              }));
            },
            onPhase: (phase, failure) => {
              updateState(current => ({
                ...current,
                ...(phase === 'ready' || phase === 'error' || phase === 'connecting'
                  ? { antigravityAuthUrl: undefined }
                  : {}),
                failure,
                phase,
              }));
              if (phase === 'ready') {
                // Sole non-mutator Bind trigger (mutator side: mutateVirtualThenRebind).
                const virtual = registry.get(virtualSessionAtom);
                if (virtual?.launchTarget === launchTarget) {
                  hostRunFork(
                    ensureVirtualAcpBound(
                      rwFromRegistry(registry),
                      refreshFsListingViaRegistry(registry, refreshSessionFsListingAtomFn),
                    ).pipe(
                      Effect.catchCause(cause =>
                        Effect.logWarning('ensureVirtualAcpBound on Ready failed', launchTarget, cause),
                      ),
                    ),
                  );
                }
              }
            },
            onRpcMessage: (direction, message) => {
              updateState(current => ({
                ...current,
                rpcCalls: [
                  ...current.rpcCalls,
                  { direction, id: crypto.randomUUID(), message, receivedAt: Date.now() },
                ],
              }));
            },
            onSessionHistoryResult: (listResult, scope) => {
              const boundSessionId = registry.get(virtualSessionAtom)?.sessionId;
              updateState(current => ({
                ...current,
                sessionHistory: historyAfterList(current.sessionHistory, listResult, scope, boundSessionId),
              }));
            },
            onSessionUpdate: (sessionId, update) => {
              const before = registry.get(backendHarnessStateAtom(launchTarget));
              const result = applySessionUpdate(before.sessions[sessionId], sessionId, before.sessionHistory, update);
              if (result.kind === 'noop') {
                return;
              }

              updateState(current => ({
                ...current,
                sessionHistory: result.sessionHistory ?? current.sessionHistory,
                sessions: upsertSession(current.sessions, result.session),
              }));

              if (result.usageChanged && result.session.usage !== undefined) {
                hostRunFork(
                  writeSessionUsage(sessionId, result.session.usage).pipe(
                    Effect.catchCause(cause => Effect.logWarning('session usage persist failed', sessionId, cause)),
                  ),
                );
              }
            },
          },
          () => registry.get(sessionListScopeAtom),
        ),
      );
    }).pipe(Atom.keepAlive),
  );

  /**
   * Stop the provider and reconcile local state: await process exit, cancel pending requests, mark sessions
   * inactive (history and transcripts preserved), clear invalid selection / Virtual binding. Sessions are not
   * reopened automatically.
   */
  const stopAndReconcile = Effect.fnUntraced(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
    yield* lifecycle.stop(launchTarget);
    resetBackendHarnessState(launchTarget);
    const current = get.registry.get(backendHarnessStateAtom(launchTarget));
    cancelPendingRequests(current);
    get.set(backendHarnessStateAtom(launchTarget), reconcileStoppedProvider(current));
    const virtual = get.registry.get(virtualSessionAtom);
    if (virtual?.launchTarget === launchTarget) {
      // The Virtual target is gone with the process: unbind and drop the target so the composer cannot send to it.
      get.set(virtualSessionAtom, { ...virtual, configValues: {}, launchTarget: undefined, sessionId: undefined });
    }
    clearSelectedSessionIfMissing(get);
  });

  const startBackend = (launchTarget: AgentLaunchTarget, get: Atom.FnContext): void => {
    get.set(backendDesiredStateAtom(launchTarget), 'running');
    get.refresh(backendHarnessAtom(launchTarget));
  };

  /** Disable: block start, await actual exit, reconcile. No hidden process, retry or stale active snapshot. */
  const stopBackendAtomFn = atomRuntime
    .fn(
      Effect.fn('stopBackendAtomFn', { root: true })(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
        yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
        yield* Effect.logWarning('Stopping ACP backend harness', launchTarget);
        get.set(backendDesiredStateAtom(launchTarget), 'stopped');
        yield* stopAndReconcile(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  /** Await stop, then start the backend once (re-reads `current.json` at spawn). */
  const restartBackendAtomFn = atomRuntime
    .fn(
      Effect.fn('restartBackendAtomFn', { root: true })(function* (
        launchTarget: AgentLaunchTarget,
        get: Atom.FnContext,
      ) {
        yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
        yield* Effect.logWarning('Restarting ACP backend harness', launchTarget);
        yield* stopAndReconcile(launchTarget, get);
        startBackend(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  const signInAntigravityAtomFn = atomRuntime
    .fn(
      Effect.fn('signInAntigravityAtomFn', { root: true })(function* (_arg: undefined, get: Atom.FnContext) {
        const launchTarget = 'antigravity-acp' as const;
        yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
        yield* Effect.logWarning('Antigravity Sign in requested');
        yield* stopAndReconcile(launchTarget, get);
        yield* requestAntigravitySignIn();
        startBackend(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  /** Start a stopped (enabled) provider once; no-op when already running. */
  const startBackendAtomFn = atomRuntime
    .fn(
      Effect.fn('startBackendAtomFn', { root: true })(function* (launchTarget: AgentLaunchTarget, get: Atom.FnContext) {
        yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
        startBackend(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  return {
    backendHarnessAtom,
    restartBackendAtomFn,
    signInAntigravityAtomFn,
    startBackend,
    startBackendAtomFn,
    stopAndReconcile,
    stopBackendAtomFn,
  };
};
