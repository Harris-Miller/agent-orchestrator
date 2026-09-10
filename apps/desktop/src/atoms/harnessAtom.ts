/** ACP backend harness lifecycle Atom (mount + restart). */
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  applySessionInfoTitle,
  applySetConfigOptionResult,
  initialBackendHarnessSnapshot,
  normalizeSessionRoster,
} from '../acp/acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot } from '../acp/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../acp/agentHarness.ts';
import { resetBackendHarnessState, runBackendHarness, stopBackendHarness } from '../acp/agentHarness.ts';
import { persistSessionUsage } from '../acp/sessionUsageStorage.ts';
import { isRecord } from '../utils.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import { backendHarnessStateAtom, clearSelectedSessionIfMissing } from './backendStateAtoms.ts';
import { patchSession, syncProviderConfigFromSessionConfiguration } from './sessionPatch.ts';

export const backendHarnessAtom = Atom.family((backend: AgentLaunchTarget) =>
  acpRuntime
    .atom(get => {
      const updateState = (patch: (current: BackendHarnessSnapshot) => BackendHarnessSnapshot) => {
        get.registry.update(backendHarnessStateAtom(backend), patch);
      };

      return runBackendHarness(backend, {
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
        onSessionUpdate: (sessionId, chatItems, update) => {
          const before = get.registry.get(backendHarnessStateAtom(backend));
          const skipConfigSync = sessionId in before.sessions && before.sessions[sessionId].status === 'activating';
          const shouldSyncConfig =
            !skipConfigSync &&
            isRecord(update) &&
            update.sessionUpdate === 'config_option_update' &&
            Array.isArray(update.configOptions);

          updateState(current => {
            let sessions = patchSession(current.sessions, sessionId, session => ({
              ...session,
              chatItems,
            }));

            let { sessionRoster } = current;

            if (shouldSyncConfig) {
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

            if (
              isRecord(update) &&
              update.sessionUpdate === 'session_info_update' &&
              typeof update.title === 'string'
            ) {
              sessionRoster = applySessionInfoTitle(current.sessionRoster, sessionId, update.title);
            }

            return {
              ...current,
              sessionRoster,
              sessions,
            };
          });

          if (shouldSyncConfig) {
            const session = get.registry.get(backendHarnessStateAtom(backend)).sessions[sessionId];
            syncProviderConfigFromSessionConfiguration(get, backend, session.sessionConfiguration);
          }
        },
        onUsageUpdate: (sessionId, usage) => {
          persistSessionUsage(sessionId, usage);
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
    Effect.fn('restartBackendAtomFn', { root: true })(function* (backend: AgentLaunchTarget, get: AcpAtomGet) {
      yield* Effect.annotateCurrentSpan({
        'acp.agent': backend,
      });
      yield* Effect.logWarning('Restarting ACP backend harness', backend);
      yield* stopBackendHarness(backend);
      resetBackendHarnessState(backend);
      get.set(backendHarnessStateAtom(backend), initialBackendHarnessSnapshot());
      clearSelectedSessionIfMissing(get);
      get.refresh(backendHarnessAtom(backend));
    }),
  )
  .pipe(Atom.keepAlive);
