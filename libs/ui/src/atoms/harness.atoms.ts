/** ACP backend harness lifecycle Atoms (mount + restart). */
import { writeConfigOptionIndexCache, writeSessionUsage } from '@lib/ao-home';
import type { LaunchTarget } from '@lib/ao-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { initialBackendHarnessSnapshot, normalizeSessionHistory } from '../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { applySessionUpdate } from '../host/applySessionUpdate.ts';
import { reconcileConfigValues } from '../host/configOptionIndexUi.ts';
import { markHistoryUnavailable, reconcileHistory } from '../host/harnessStateTransitions.ts';
import {
  requestAntigravitySignIn,
  resetBackendHarnessState,
  runBackendHarness,
  stopBackendHarness,
} from '../host/backendHarness.ts';
import { patchSession, upsertSession } from '../host/sessionSnapshot.ts';

import { backendHarnessStateAtom, clearSelectedSessionIfMissing, configOptionIndexAtom } from './backendState.atoms.ts';
import type { createSessionFsListingAtoms } from './sessionFsListing.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import {
  ensureVirtualAcpBound,
  excludeBoundVirtualFromHistory,
  refreshFsListingViaRegistry,
  rwFromRegistry,
} from './virtualBind.ts';
import { virtualSessionAtom } from './virtualSession.atoms.ts';

type RefreshSessionFsListingAtomFn = ReturnType<typeof createSessionFsListingAtoms>['refreshSessionFsListingAtomFn'];

export const createHarnessAtoms = (
  runtime: HostRuntimeBag,
  refreshSessionFsListingAtomFn: RefreshSessionFsListingAtomFn,
) => {
  const { atomRuntime, hostRunFork } = runtime;

  const backendHarnessAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
    atomRuntime
      .atom(get => {
        const updateState = (patch: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot) => {
          get.registry.update(backendHarnessStateAtom(launchTarget), patch);
        };

        return runBackendHarness(
          launchTarget,
          {
            onAntigravityAuthUrl: url => {
              updateState(current => ({
                ...current,
                antigravityAuthUrl: url,
              }));
            },
            onConfigOptionIndexPublish: index => {
              get.registry.set(configOptionIndexAtom(launchTarget), index);
              const virtual = get.registry.get(virtualSessionAtom);
              if (virtual?.launchTarget === launchTarget) {
                get.registry.set(virtualSessionAtom, {
                  ...virtual,
                  configValues: reconcileConfigValues(index, virtual.configValues),
                });
              }
              hostRunFork(
                writeConfigOptionIndexCache(launchTarget as LaunchTarget, index).pipe(
                  Effect.catchCause(cause =>
                    Effect.logWarning('config option index persist failed', launchTarget, cause),
                  ),
                ),
              );
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
            onPhase: (phase, error) => {
              updateState(current => ({
                ...current,
                ...(phase === 'ready' || phase === 'error' || phase === 'connecting'
                  ? { antigravityAuthUrl: undefined }
                  : {}),
                error,
                phase,
              }));
              if (phase === 'ready') {
                // Sole non-mutator Bind trigger (mutator side: mutateVirtualThenRebind).
                const virtual = get.registry.get(virtualSessionAtom);
                if (virtual?.launchTarget === launchTarget) {
                  const { registry } = get;
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
              const boundSessionId = get.registry.get(virtualSessionAtom)?.sessionId;
              updateState(current => ({
                ...current,
                sessionHistory: reconcileHistory(
                  current.sessionHistory,
                  excludeBoundVirtualFromHistory(normalizeSessionHistory(listResult), boundSessionId),
                  scope,
                ),
              }));
            },
            onSessionUpdate: (sessionId, update) => {
              const before = get.registry.get(backendHarnessStateAtom(launchTarget));
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
          () => get.registry.get(sessionListScopeAtom),
        );
      })
      .pipe(Atom.keepAlive),
  );

  const resetAndRefreshHarness = (launchTarget: AgentLaunchTarget, get: Atom.FnContext): void => {
    resetBackendHarnessState(launchTarget);
    const current = get.registry.get(backendHarnessStateAtom(launchTarget));
    get.set(backendHarnessStateAtom(launchTarget), {
      ...initialBackendHarnessSnapshot(),
      sessionHistory: markHistoryUnavailable(current.sessionHistory),
    });
    clearSelectedSessionIfMissing(get);
    get.refresh(backendHarnessAtom(launchTarget));
  };

  const restartBackendAtomFn = atomRuntime
    .fn(
      Effect.fn('restartBackendAtomFn', { root: true })(function* (
        launchTarget: AgentLaunchTarget,
        get: Atom.FnContext,
      ) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': launchTarget,
        });
        yield* Effect.logWarning('Restarting ACP backend harness', launchTarget);
        yield* stopBackendHarness(launchTarget);
        resetAndRefreshHarness(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  const signInAntigravityAtomFn = atomRuntime
    .fn(
      Effect.fn('signInAntigravityAtomFn', { root: true })(function* (_arg: undefined, get: Atom.FnContext) {
        const launchTarget = 'antigravity-acp' as const;
        yield* Effect.annotateCurrentSpan({
          'acp.agent': launchTarget,
        });
        yield* Effect.logWarning('Antigravity Sign in requested');
        yield* stopBackendHarness(launchTarget);
        yield* requestAntigravitySignIn();
        resetAndRefreshHarness(launchTarget, get);
      }),
    )
    .pipe(Atom.keepAlive);

  return { backendHarnessAtom, restartBackendAtomFn, signInAntigravityAtomFn };
};
