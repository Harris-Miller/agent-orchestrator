/** ACP backend harness lifecycle Atom (mount + restart). */
import { writeSessionUsage } from '@lib/ao-home';
import { TauriServicesLive } from '@lib/context-services-tauri';
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  applySessionInfoTitle,
  applySetConfigOptionResult,
  initialBackendHarnessSnapshot,
  normalizeSessionRoster,
} from '../acp/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../acp/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';
import { resetBackendHarnessState, runBackendHarness, stopBackendHarness } from '../acp/backendHarness.ts';
import { isRecord } from '../utils.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import { backendHarnessStateAtom, clearSelectedSessionIfMissing } from './backendStateAtoms.ts';
import { foldSessionUpdate } from './foldSessionUpdate.ts';
import { patchSession, syncProviderConfigFromSessionConfiguration } from './sessionPatch.ts';

export const backendHarnessAtom = Atom.family((launchTarget: AgentLaunchTarget) =>
  acpRuntime
    .atom(get => {
      const updateState = (patch: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot) => {
        get.registry.update(backendHarnessStateAtom(launchTarget), patch);
      };

      return runBackendHarness(launchTarget, {
        onCommandsReady: (sessionId, availableCommands) => {
          updateState(current => ({
            ...current,
            sessions: patchSession(current.sessions, sessionId, session => ({
              ...session,
              availableCommands,
            })),
          }));
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
          const fold = foldSessionUpdate(before.sessions[sessionId], update);
          if (fold.kind === 'noop') {
            return;
          }

          updateState(current => {
            let sessions = fold.transcriptChanged
              ? patchSession(current.sessions, sessionId, session => ({
                  ...session,
                  transcript: fold.transcript,
                }))
              : current.sessions;

            let { sessionRoster } = current;

            if (fold.shouldSyncConfig && isRecord(update) && Array.isArray(update.configOptions)) {
              sessions = patchSession(sessions, sessionId, session => {
                const applied = applySetConfigOptionResult(session.sessionConfiguration, {
                  configOptions: update.configOptions,
                });
                return {
                  ...session,
                  selectedModeId: applied.selectedModeId ?? session.selectedModeId,
                  selectedModelId: applied.selectedModelId ?? session.selectedModelId,
                  sessionConfiguration: applied.sessionConfiguration,
                };
              });
            }

            if (fold.sessionInfoTitle !== undefined) {
              sessionRoster = applySessionInfoTitle(current.sessionRoster, sessionId, fold.sessionInfoTitle);
            }

            return {
              ...current,
              sessionRoster,
              sessions,
            };
          });

          if (fold.shouldSyncConfig) {
            const session = get.registry.get(backendHarnessStateAtom(launchTarget)).sessions[sessionId];
            syncProviderConfigFromSessionConfiguration(get, launchTarget, session.sessionConfiguration);
          }
        },
        onUsageUpdate: (sessionId, usage) => {
          Effect.runFork(
            writeSessionUsage(sessionId, usage).pipe(
              Effect.provide(TauriServicesLive),
              Effect.catchCause(cause => Effect.logWarning('session usage persist failed', sessionId, cause)),
            ),
          );
          updateState(current => ({
            ...current,
            sessions: patchSession(current.sessions, sessionId, session => ({
              ...session,
              usage,
            })),
          }));
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
