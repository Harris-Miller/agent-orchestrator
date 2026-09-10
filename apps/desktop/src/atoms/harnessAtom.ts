/** ACP backend harness lifecycle Atom (mount + restart). */
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  applySessionInfoTitle,
  applySetConfigOptionResult,
  initialBackendSnapshot,
  normalizeSessionRoster,
} from '../prototype/agentChat/acpSessionBootstrap.ts';
import type { BackendSnapshot } from '../prototype/agentChat/acpSessionBootstrap.ts';
import type { AcpAgentBackend } from '../prototype/agentChat/agentHarness.ts';
import {
  resetBackendHarnessState,
  runBackendHarness,
  stopBackendHarness,
} from '../prototype/agentChat/agentHarness.ts';
import { persistSessionUsage } from '../prototype/agentChat/sessionUsageStorage.ts';
import { isRecord } from '../utils.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import { backendStateAtom, clearSelectedSessionIfMissing } from './backendStateAtoms.ts';
import { patchSession, syncProviderConfigFromSessionConfiguration } from './sessionPatch.ts';

export const backendHarnessAtom = Atom.family((backend: AcpAgentBackend) =>
  acpRuntime
    .atom(get => {
      const updateState = (patch: (current: BackendSnapshot) => BackendSnapshot) => {
        get.registry.update(backendStateAtom(backend), patch);
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
          const before = get.registry.get(backendStateAtom(backend));
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
                const applied = applySetConfigOptionResult(session.sessionState, {
                  configOptions: update.configOptions,
                });
                return {
                  ...session,
                  selectedModeId: applied.selectedModeId ?? session.selectedModeId,
                  selectedModelId: applied.selectedModelId ?? session.selectedModelId,
                  sessionState: applied.sessionState,
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
            const session = get.registry.get(backendStateAtom(backend)).sessions[sessionId];
            syncProviderConfigFromSessionConfiguration(get, backend, session.sessionState);
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

export const restartBackendFn = acpRuntime
  .fn(
    Effect.fn('restartBackendFn', { root: true })(function* (backend: AcpAgentBackend, get: AcpAtomGet) {
      yield* Effect.annotateCurrentSpan({
        'acp.agent': backend,
      });
      yield* Effect.logWarning('Restarting ACP backend harness', backend);
      yield* stopBackendHarness(backend);
      resetBackendHarnessState(backend);
      get.set(backendStateAtom(backend), initialBackendSnapshot());
      clearSelectedSessionIfMissing(get);
      get.refresh(backendHarnessAtom(backend));
    }),
  )
  .pipe(Atom.keepAlive);
