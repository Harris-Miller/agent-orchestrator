/** ACP backend harness lifecycle Atoms (mount + restart). */
import { writeSessionUsage } from '@lib/ao-home';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { initialBackendHarnessSnapshot, normalizeSessionRoster } from '../host/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { applySessionUpdate } from '../host/applySessionUpdate.ts';
import { resetBackendHarnessState, runBackendHarness, stopBackendHarness } from '../host/backendHarness.ts';
import { patchSession, upsertSession } from '../host/sessionSnapshot.ts';

import { backendHarnessStateAtom, clearSelectedSessionIfMissing, configOptionIndexAtom } from './backendState.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';

export const createHarnessAtoms = (runtime: HostRuntimeBag) => {
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
            onConfigOptionIndexClear: () => {
              get.registry.set(configOptionIndexAtom(launchTarget), undefined);
            },
            onConfigOptionIndexPublish: index => {
              get.registry.set(configOptionIndexAtom(launchTarget), index);
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
                error,
                phase,
              }));
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
            onSessionRosterResult: listResult => {
              updateState(current => ({
                ...current,
                sessionRoster: normalizeSessionRoster(listResult),
              }));
            },
            onSessionUpdate: (sessionId, update) => {
              const before = get.registry.get(backendHarnessStateAtom(launchTarget));
              const result = applySessionUpdate(before.sessions[sessionId], sessionId, before.sessionRoster, update);
              if (result.kind === 'noop') {
                return;
              }

              updateState(current => ({
                ...current,
                sessionRoster: result.sessionRoster ?? current.sessionRoster,
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
        resetBackendHarnessState(launchTarget);
        get.set(backendHarnessStateAtom(launchTarget), initialBackendHarnessSnapshot());
        get.set(configOptionIndexAtom(launchTarget), undefined);
        clearSelectedSessionIfMissing(get);
        get.refresh(backendHarnessAtom(launchTarget));
      }),
    )
    .pipe(Atom.keepAlive);

  return { backendHarnessAtom, restartBackendAtomFn };
};
