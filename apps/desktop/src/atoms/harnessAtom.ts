/** ACP backend harness lifecycle Atom (mount + restart). */
import { writeSessionUsage } from '@lib/ao-home';
import { TauriServicesLive } from '@lib/context-services-tauri';
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { initialBackendHarnessSnapshot, normalizeSessionRoster } from '../acp/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../acp/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';
import { applySessionUpdate } from '../acp/applySessionUpdate.ts';
import { resetBackendHarnessState, runBackendHarness, stopBackendHarness } from '../acp/backendHarness.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import { backendHarnessStateAtom, clearSelectedSessionIfMissing } from './backendStateAtoms.ts';
import { patchSession, syncProviderConfigFromSessionConfiguration, upsertSession } from './sessionPatch.ts';

export const backendHarnessAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  acpRuntime
    .atom(get => {
      const updateState = (patch: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot) => {
        get.registry.update(backendHarnessStateAtom(launchTarget), patch);
      };

      return runBackendHarness(launchTarget, {
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
            rpcCalls: [...current.rpcCalls, { direction, id: crypto.randomUUID(), message }],
          }));
        },
        onSessionRosterResult: listResult => {
          updateState(current => ({
            ...current,
            phase: 'ready',
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

          if (result.shouldSyncConfig) {
            syncProviderConfigFromSessionConfiguration(get, launchTarget, result.session.sessionConfiguration);
          }

          if (result.usageChanged && result.session.usage !== undefined) {
            Effect.runFork(
              writeSessionUsage(sessionId, result.session.usage).pipe(
                Effect.provide(TauriServicesLive),
                Effect.catchCause(cause => Effect.logWarning('session usage persist failed', sessionId, cause)),
              ),
            );
          }
        },
      });
    })
    .pipe(Atom.keepAlive),
);

export const restartBackendAtomFn = acpRuntime
  .fn(
    Effect.fn('restartBackendAtomFn', { root: true })(function* (launchTarget: AgentLaunchTarget, get: AcpAtomGet) {
      yield* Effect.annotateCurrentSpan({
        'acp.agent': launchTarget,
      });
      yield* Effect.logWarning('Restarting ACP backend harness', launchTarget);
      yield* stopBackendHarness(launchTarget);
      resetBackendHarnessState(launchTarget);
      get.set(backendHarnessStateAtom(launchTarget), initialBackendHarnessSnapshot());
      clearSelectedSessionIfMissing(get);
      get.refresh(backendHarnessAtom(launchTarget));
    }),
  )
  .pipe(Atom.keepAlive);
