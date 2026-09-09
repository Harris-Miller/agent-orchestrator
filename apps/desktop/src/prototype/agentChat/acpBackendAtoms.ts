/** Effect Atom state for parallel ACP backend harnesses. */
import type { CreateElicitationResponseBody } from '@libs/effect-acp';
import { Effect, Exit, Schema } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import { layer as TauriServicesLive } from '../../context-services/TauriServices.ts';
import { isRecord } from '../../utils.ts';

import {
  ALL_ACP_BACKENDS,
  applySessionInfoTitle,
  applySetConfigOptionResult,
  backendLabel,
  defectsFromActivationFailure,
  initialBackendSnapshot,
  initialSessionSnapshot,
  normalizeConfigOptions,
  normalizeSelectableConfigOptions,
  normalizeSessionInfoFromNew,
  normalizeSessionRoster,
  patchConfigOptionValue,
  selectionFromSessionConfiguration,
  upsertRosterEntry,
} from './acpSessionBootstrap.ts';
import type { BackendSnapshot, SessionSnapshot, UnifiedRosterEntry } from './acpSessionBootstrap.ts';
import type { AcpAgentBackend } from './agentHarness.ts';
import {
  appendBackendUserChatItem,
  closeSession,
  createSession,
  deleteSession,
  getAgentHandle,
  listSessions,
  loadSession,
  resetBackendHarnessState,
  resumeSession,
  runBackendHarness,
  sendPrompt,
  setConfigOption,
  stopBackendHarness,
} from './agentHarness.ts';
import { buildTargetHandoffSeedPrompt, extractHandoffDocument, SOURCE_HANDOFF_PROMPT } from './handoffDocument.ts';
import { getPromptSpan } from './promptSpanRegistry.ts';
import {
  defaultsFromSelectable,
  harnessDefaultDiffs,
  readProviderConfig,
  refreshCatalogFromSessionConfiguration,
  saveHarnessDefaults,
} from './providerConfigStorage.ts';
import type { ProviderConfigStored } from './providerConfigStorage.ts';
import { joinDirectory, listChildDirectories, parentDirectory, resolveHomeDir } from './sessionDirectoryBrowser.ts';
import { persistSessionUsage, readPersistedSessionUsage } from './sessionUsageStorage.ts';

const acpRuntime = Atom.runtime(() => TauriServicesLive);

export const providerConfigAtom = Atom.family((backend: AcpAgentBackend) =>
  Atom.make<ProviderConfigStored | undefined>(readProviderConfig(backend)).pipe(
    Atom.withLabel(`providerConfig:${backend}`),
    Atom.keepAlive,
  ),
);

export const resolveHomeDirFn = acpRuntime.fn((_arg: undefined) => resolveHomeDir()).pipe(Atom.keepAlive);

export const listChildDirectoriesFn = acpRuntime
  .fn((dirPath: string) => listChildDirectories(dirPath))
  .pipe(Atom.keepAlive);

export const parentDirectoryFn = acpRuntime.fn((dirPath: string) => parentDirectory(dirPath)).pipe(Atom.keepAlive);

export const joinDirectoryFn = acpRuntime
  .fn((arg: { childName: string; dirPath: string }) => joinDirectory(arg.dirPath, arg.childName))
  .pipe(Atom.keepAlive);

export const selectedSessionIdAtom = Atom.make<string | undefined>(undefined).pipe(Atom.keepAlive);

/** True while a multi-step Handoff pipeline is running (covers gaps between RPCs). */
export const handoffInProgressAtom = Atom.make(false).pipe(Atom.keepAlive);

export class HandoffError extends Schema.TaggedError<HandoffError>()('HandoffError', {
  message: Schema.String,
}) {}

export const rpcWireLogBackendAtom = Atom.make<AcpAgentBackend>('codex-acp').pipe(Atom.keepAlive);

export const backendStateAtom = Atom.family((backend: AcpAgentBackend) =>
  Atom.make(initialBackendSnapshot()).pipe(Atom.withLabel(`backendState:${backend}`), Atom.keepAlive),
);

export const draftAtom = Atom.family((_sessionId: string) => Atom.make('').pipe(Atom.keepAlive));

export const unifiedSessionRosterAtom = Atom.make(get => {
  const entries: UnifiedRosterEntry[] = [];
  for (const backend of ALL_ACP_BACKENDS) {
    for (const entry of get(backendStateAtom(backend)).sessionRoster) {
      entries.push({ ...entry, backend });
    }
  }
  return entries;
}).pipe(Atom.keepAlive);

const findBackendForSessionId = (
  getSnapshot: (backend: AcpAgentBackend) => BackendSnapshot,
  sessionId: string,
): AcpAgentBackend | undefined => {
  for (const backend of ALL_ACP_BACKENDS) {
    const snapshot = getSnapshot(backend);
    if (sessionId in snapshot.sessions || snapshot.sessionRoster.some(entry => entry.sessionId === sessionId)) {
      return backend;
    }
  }
  return undefined;
};

export const selectedSessionBackendAtom = Atom.make(get => {
  const sessionId = get(selectedSessionIdAtom);
  if (sessionId === undefined) {
    return undefined;
  }
  return findBackendForSessionId(backend => get(backendStateAtom(backend)), sessionId);
}).pipe(Atom.keepAlive);

export const selectedSessionAtom = Atom.make(get => {
  const sessionId = get(selectedSessionIdAtom);
  const backend = get(selectedSessionBackendAtom);
  if (sessionId === undefined || backend === undefined) {
    return undefined;
  }
  return get(backendStateAtom(backend)).sessions[sessionId];
}).pipe(Atom.keepAlive);

export const selectedSessionSnapshotAtom = Atom.make(get => {
  const backend = get(selectedSessionBackendAtom);
  if (backend === undefined) {
    return undefined;
  }
  return get(backendStateAtom(backend));
}).pipe(Atom.keepAlive);

export const rpcWireLogSnapshotAtom = Atom.make(get => get(backendStateAtom(get(rpcWireLogBackendAtom)))).pipe(
  Atom.keepAlive,
);

export const allBackendPhasesAtom = Atom.make(get =>
  ALL_ACP_BACKENDS.map(backend => ({
    backend,
    error: get(backendStateAtom(backend)).error,
    label: backendLabel(backend),
    phase: get(backendStateAtom(backend)).phase,
  })),
).pipe(Atom.keepAlive);

type AcpAtomGet = Parameters<Parameters<typeof acpRuntime.fn>[0]>[1];

const syncProviderConfigFromSessionConfiguration = (
  get: AcpAtomGet,
  backend: AcpAgentBackend,
  sessionConfiguration: unknown,
) => {
  const next = refreshCatalogFromSessionConfiguration(backend, sessionConfiguration);
  get.set(providerConfigAtom(backend), next);
};

const clearSelectedSessionIfMissing = (get: AcpAtomGet) => {
  const sessionId = get(selectedSessionIdAtom);
  if (sessionId === undefined) {
    return;
  }
  if (findBackendForSessionId(backend => get(backendStateAtom(backend)), sessionId) === undefined) {
    get.set(selectedSessionIdAtom, undefined);
  }
};

const selectSession = (get: AcpAtomGet, backend: AcpAgentBackend, sessionId: string) => {
  get.set(selectedSessionIdAtom, sessionId);
  get.set(rpcWireLogBackendAtom, backend);
};

const applySessionActivationResult = (
  sessionId: string,
  result: unknown,
  existing?: SessionSnapshot,
): SessionSnapshot => {
  const selection = selectionFromSessionConfiguration(result);
  return {
    availableCommands: existing?.availableCommands,
    chatItems: existing?.chatItems ?? [],
    pendingClientRequest: false,
    selectedModeId: selection.selectedModeId,
    selectedModelId: selection.selectedModelId,
    sessionId,
    sessionState: result,
    status: 'active',
    usage: existing?.usage,
  };
};

const upsertSession = (
  sessions: Readonly<Record<string, SessionSnapshot>>,
  session: SessionSnapshot,
): Readonly<Record<string, SessionSnapshot>> => ({
  ...sessions,
  [session.sessionId]: session,
});

const patchSession = (
  sessions: Readonly<Record<string, SessionSnapshot>>,
  sessionId: string,
  patch: (current: SessionSnapshot) => SessionSnapshot,
): Readonly<Record<string, SessionSnapshot>> => {
  const current = sessions[sessionId] ?? initialSessionSnapshot(sessionId);
  return upsertSession(sessions, patch(current));
};

const withSessionClientRequest = <A, E, R>(
  backend: AcpAgentBackend,
  get: AcpAtomGet,
  sessionId: string,
  rpc: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const snapshot = get(backendStateAtom(backend));
    const session = snapshot.sessions[sessionId];
    const agent = getAgentHandle(backend);

    if (
      session.status !== 'active' ||
      session.pendingClientRequest === true ||
      session.pendingElicitation !== undefined ||
      session.pendingPermission !== undefined ||
      agent === undefined
    ) {
      yield* Effect.logDebug('Skipping session client request', backend, sessionId, {
        hasAgent: agent !== undefined,
        pendingClientRequest: session.pendingClientRequest === true,
        pendingElicitation: session.pendingElicitation !== undefined,
        pendingPermission: session.pendingPermission !== undefined,
        status: session.status,
      });
      return undefined as A;
    }

    get.set(backendStateAtom(backend), {
      ...snapshot,
      sessions: patchSession(snapshot.sessions, sessionId, current => ({
        ...current,
        pendingClientRequest: true,
      })),
    });

    return yield* rpc.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          const currentSnapshot = get(backendStateAtom(backend));
          get.set(backendStateAtom(backend), {
            ...currentSnapshot,
            sessions: patchSession(currentSnapshot.sessions, sessionId, current => ({
              ...current,
              pendingClientRequest: false,
            })),
          });
        }),
      ),
    );
  });

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

export const selectSessionFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend; sessionId: string }, get) =>
    Effect.sync(() => {
      selectSession(get, arg.backend, arg.sessionId);
    }),
  )
  .pipe(Atom.keepAlive);

export const refreshSessionRosterFn = acpRuntime
  .fn(
    Effect.fn('refreshSessionRosterFn')(
      function* (backend: AcpAgentBackend, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': backend,
          'ao.action': 'system.refreshSessionRoster',
          'ao.action.kind': 'system',
        });
        const agent = getAgentHandle(backend);
        if (agent === undefined) {
          yield* Effect.logDebug('refreshSessionRoster skipped; no agent', backend);
          return;
        }

        yield* Effect.logDebug('Refreshing session roster', backend);
        const listResult = yield* listSessions(agent);
        const snapshot = get(backendStateAtom(backend));
        get.set(backendStateAtom(backend), {
          ...snapshot,
          sessionRoster: normalizeSessionRoster(listResult),
        });
        clearSelectedSessionIfMissing(get);
      },
      (effect, backend) =>
        effect.pipe(Effect.tapError(error => Effect.logError('refreshSessionRoster failed', backend, error))),
    ),
  )
  .pipe(Atom.keepAlive);

export const refreshAllSessionRostersFn = acpRuntime
  .fn(
    Effect.fn('refreshAllSessionRostersFn')(function* (_arg: undefined, get: AcpAtomGet) {
      yield* Effect.annotateCurrentSpan({
        'ao.action': 'system.refreshAllSessionRosters',
        'ao.action.kind': 'system',
      });
      yield* Effect.forEach(
        ALL_ACP_BACKENDS,
        backend =>
          Effect.gen(function* () {
            const agent = getAgentHandle(backend);
            if (agent === undefined) {
              return;
            }
            const listResult = yield* listSessions(agent);
            const snapshot = get(backendStateAtom(backend));
            get.set(backendStateAtom(backend), {
              ...snapshot,
              sessionRoster: normalizeSessionRoster(listResult),
            });
          }),
        { concurrency: 'unbounded' },
      );
      clearSelectedSessionIfMissing(get);
    }),
  )
  .pipe(Atom.keepAlive);

export const createSessionFn = acpRuntime
  .fn(
    Effect.fn('createSessionFn')(
      function* (arg: { backend: AcpAgentBackend; cwd: string }, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'ao.action': 'user.createSession',
          'ao.action.kind': 'user',
        });
        const agent = getAgentHandle(arg.backend);
        if (agent === undefined) {
          yield* Effect.logWarning('createSession skipped; no agent', arg.backend);
          return;
        }

        yield* Effect.logInfo('UI createSession', arg.backend, { cwd: arg.cwd });
        const { cwd, result } = yield* createSession(agent, arg.cwd);
        const { sessionId } = result;
        yield* Effect.annotateCurrentSpan('acp.sessionId', sessionId);

        syncProviderConfigFromSessionConfiguration(get, arg.backend, result);

        let sessionState: unknown = result;
        const { defaults } = get(providerConfigAtom(arg.backend)) ?? { defaults: {} };
        for (const diff of harnessDefaultDiffs(sessionState, defaults)) {
          const patched = patchConfigOptionValue(sessionState, diff.configId, diff.value);
          const exit = yield* Effect.exit(setConfigOption(agent, sessionId, diff.configId, diff.value));
          if (Exit.isFailure(exit)) {
            yield* Effect.logWarning('Default config option apply failed during create', arg.backend, diff.configId);
            break;
          }
          const { sessionState: nextSessionState } = applySetConfigOptionResult(patched, exit.value);
          sessionState = nextSessionState;
        }

        syncProviderConfigFromSessionConfiguration(get, arg.backend, sessionState);

        const session = applySessionActivationResult(sessionId, sessionState);
        const rosterEntry = normalizeSessionInfoFromNew(result, cwd);
        const snapshot = get(backendStateAtom(arg.backend));

        get.set(backendStateAtom(arg.backend), {
          ...snapshot,
          sessionRoster:
            rosterEntry === undefined ? snapshot.sessionRoster : upsertRosterEntry(snapshot.sessionRoster, rosterEntry),
          sessions: upsertSession(snapshot.sessions, session),
        });
        selectSession(get, arg.backend, sessionId);
        yield* Effect.logInfo('UI createSession complete', arg.backend, sessionId);
      },
      (effect, arg) =>
        effect.pipe(Effect.tapError(error => Effect.logError('createSessionFn failed', arg.backend, error))),
    ),
  )
  .pipe(Atom.keepAlive);

const promptPinnedSession = Effect.fn('promptPinnedSession')(
  function* (backend: AcpAgentBackend, get: AcpAtomGet, sessionId: string, text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return yield* new HandoffError({ message: 'Handoff prompt text is empty' });
    }

    const agent = getAgentHandle(backend);
    if (agent === undefined) {
      return yield* new HandoffError({ message: `Agent handle missing for ${backendLabel(backend)}` });
    }

    const snapshot = get(backendStateAtom(backend));
    const session = snapshot.sessions[sessionId];
    if (session.status !== 'active') {
      return yield* new HandoffError({ message: `Session ${sessionId} is not active` });
    }
    if (
      session.pendingClientRequest === true ||
      session.pendingElicitation !== undefined ||
      session.pendingPermission !== undefined
    ) {
      return yield* new HandoffError({ message: `Session ${sessionId} cannot accept a prompt right now` });
    }

    yield* Effect.logInfo('Pinned session prompt', backend, sessionId, { chars: trimmed.length });
    const chatItems = appendBackendUserChatItem(backend, sessionId, trimmed);
    get.set(backendStateAtom(backend), {
      ...snapshot,
      sessions: patchSession(snapshot.sessions, sessionId, current => ({
        ...current,
        chatItems,
      })),
    });

    yield* withSessionClientRequest(backend, get, sessionId, sendPrompt(backend, agent, sessionId, trimmed));
  },
  (effect, backend, _get, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('promptPinnedSession failed', backend, sessionId, error))),
);

export const handoffSessionFn = acpRuntime
  .fn(
    Effect.fn('handoffSessionFn')(
      function* (
        arg: {
          configValues: Readonly<Record<string, string>>;
          sourceBackend: AcpAgentBackend;
          sourceSessionId: string;
          targetBackend: AcpAgentBackend;
        },
        get: AcpAtomGet,
      ) {
        get.set(handoffInProgressAtom, true);
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.sourceBackend,
          'acp.sessionId': arg.sourceSessionId,
          'ao.action': 'user.handoffSession',
          'ao.action.kind': 'user',
        });
        yield* Effect.logInfo('Handoff started', {
          sourceBackend: arg.sourceBackend,
          sourceSessionId: arg.sourceSessionId,
          targetBackend: arg.targetBackend,
        });
        const sourceEntry = get(unifiedSessionRosterAtom).find(
          entry => entry.backend === arg.sourceBackend && entry.sessionId === arg.sourceSessionId,
        );
        if (sourceEntry === undefined) {
          return yield* new HandoffError({ message: 'Source session cwd not found on roster' });
        }

        // Source handoff prompt is the only hard gate: failure means no target session.
        yield* promptPinnedSession(arg.sourceBackend, get, arg.sourceSessionId, SOURCE_HANDOFF_PROMPT);

        const sourceChatItems = get(backendStateAtom(arg.sourceBackend)).sessions[arg.sourceSessionId].chatItems;
        const handoffDocument = extractHandoffDocument(sourceChatItems);
        if (handoffDocument === undefined) {
          return yield* new HandoffError({ message: 'Handoff document missing from source agent response' });
        }

        // After a successful source response, target create / config / seed failures are soft.
        const targetAgent = getAgentHandle(arg.targetBackend);
        if (targetAgent === undefined) {
          yield* Effect.logWarning('Handoff soft-abort; target agent missing', arg.targetBackend);
          return;
        }

        const createExit = yield* Effect.exit(createSession(targetAgent, sourceEntry.cwd));
        if (Exit.isFailure(createExit)) {
          yield* Effect.logWarning('Handoff soft-abort; target session create failed', arg.targetBackend);
          return;
        }
        const { cwd, result } = createExit.value;
        const { sessionId: targetSessionId } = result;

        syncProviderConfigFromSessionConfiguration(get, arg.targetBackend, result);

        const rosterEntry = normalizeSessionInfoFromNew(result, cwd);
        const createdSnapshot = get(backendStateAtom(arg.targetBackend));
        get.set(backendStateAtom(arg.targetBackend), {
          ...createdSnapshot,
          sessionRoster:
            rosterEntry === undefined
              ? createdSnapshot.sessionRoster
              : upsertRosterEntry(createdSnapshot.sessionRoster, rosterEntry),
          sessions: upsertSession(createdSnapshot.sessions, applySessionActivationResult(targetSessionId, result)),
        });
        selectSession(get, arg.targetBackend, targetSessionId);

        let sessionState: unknown = result;
        const { defaults } = get(providerConfigAtom(arg.targetBackend)) ?? { defaults: {} };
        for (const diff of harnessDefaultDiffs(sessionState, defaults)) {
          const patched = patchConfigOptionValue(sessionState, diff.configId, diff.value);
          const exit = yield* Effect.exit(setConfigOption(targetAgent, targetSessionId, diff.configId, diff.value));
          if (Exit.isFailure(exit)) {
            yield* Effect.logWarning('Handoff default config apply failed', arg.targetBackend, diff.configId);
            break;
          }
          const { sessionState: nextSessionState } = applySetConfigOptionResult(patched, exit.value);
          sessionState = nextSessionState;
        }

        for (const diff of harnessDefaultDiffs(sessionState, arg.configValues)) {
          const patched = patchConfigOptionValue(sessionState, diff.configId, diff.value);
          const exit = yield* Effect.exit(setConfigOption(targetAgent, targetSessionId, diff.configId, diff.value));
          if (Exit.isFailure(exit)) {
            yield* Effect.logWarning('Handoff config value apply failed', arg.targetBackend, diff.configId);
            break;
          }
          const { sessionState: nextSessionState } = applySetConfigOptionResult(patched, exit.value);
          sessionState = nextSessionState;
        }

        syncProviderConfigFromSessionConfiguration(get, arg.targetBackend, sessionState);

        const configuredSnapshot = get(backendStateAtom(arg.targetBackend));
        get.set(backendStateAtom(arg.targetBackend), {
          ...configuredSnapshot,
          sessions: upsertSession(
            configuredSnapshot.sessions,
            applySessionActivationResult(targetSessionId, sessionState),
          ),
        });

        const seedExit = yield* Effect.exit(
          promptPinnedSession(arg.targetBackend, get, targetSessionId, buildTargetHandoffSeedPrompt(handoffDocument)),
        );
        if (Exit.isFailure(seedExit)) {
          yield* Effect.logWarning('Handoff target seed prompt failed', arg.targetBackend, targetSessionId);
        } else {
          yield* Effect.logInfo('Handoff complete', {
            sourceSessionId: arg.sourceSessionId,
            targetSessionId,
          });
        }
      },
      (effect, _arg, get: AcpAtomGet) =>
        effect.pipe(
          Effect.tapError(error => Effect.logError('Handoff failed', error)),
          Effect.ensuring(
            Effect.sync(() => {
              get.set(handoffInProgressAtom, false);
            }),
          ),
        ),
    ),
  )
  .pipe(Atom.keepAlive);

export const activateSessionFn = acpRuntime
  .fn(
    Effect.fn('activateSessionFn')(function* (arg: { backend: AcpAgentBackend; sessionId: string }, get: AcpAtomGet) {
      yield* Effect.annotateCurrentSpan({
        'acp.agent': arg.backend,
        'acp.sessionId': arg.sessionId,
        'ao.action': 'user.activateSession',
        'ao.action.kind': 'user',
      });
      const agent = getAgentHandle(arg.backend);
      if (agent === undefined) {
        yield* Effect.logWarning('activateSession skipped; no agent', arg.backend);
        return;
      }

      const snapshot = get(backendStateAtom(arg.backend));
      const hasHistory = arg.sessionId in snapshot.sessions && snapshot.sessions[arg.sessionId].chatItems.length > 0;
      yield* Effect.logInfo('Activating session', arg.backend, arg.sessionId, {
        mode: hasHistory ? 'resume' : 'load',
      });

      selectSession(get, arg.backend, arg.sessionId);
      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, arg.sessionId, session => ({
          ...session,
          defects: undefined,
          status: 'activating',
        })),
      });

      const exit = yield* Effect.exit(
        hasHistory ? resumeSession(agent, arg.sessionId) : loadSession(agent, arg.sessionId),
      );

      if (Exit.isFailure(exit)) {
        yield* Effect.logError('Session activation failed', arg.backend, arg.sessionId);
        const current = get(backendStateAtom(arg.backend));
        get.set(backendStateAtom(arg.backend), {
          ...current,
          sessions: patchSession(current.sessions, arg.sessionId, session => ({
            ...session,
            defects: defectsFromActivationFailure(current.rpcCalls, exit.cause),
            status: 'inactive',
          })),
        });
        return;
      }

      const persistedUsage = readPersistedSessionUsage(arg.sessionId);
      syncProviderConfigFromSessionConfiguration(get, arg.backend, exit.value);
      get.set(backendStateAtom(arg.backend), {
        ...get(backendStateAtom(arg.backend)),
        sessions: patchSession(get(backendStateAtom(arg.backend)).sessions, arg.sessionId, session => ({
          ...applySessionActivationResult(arg.sessionId, exit.value, session),
          usage: persistedUsage,
        })),
      });
      yield* Effect.logInfo('Session activated', arg.backend, arg.sessionId);
    }),
  )
  .pipe(Atom.keepAlive);

export const deactivateSessionFn = acpRuntime
  .fn(
    Effect.fn('deactivateSessionFn')(
      function* (arg: { backend: AcpAgentBackend; sessionId: string }, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
          'ao.action': 'user.deactivateSession',
          'ao.action.kind': 'user',
        });
        const agent = getAgentHandle(arg.backend);
        if (agent === undefined) {
          yield* Effect.logWarning('deactivateSession skipped; no agent', arg.backend);
          return;
        }

        yield* Effect.logInfo('Deactivating session', arg.backend, arg.sessionId);
        yield* closeSession(agent, arg.sessionId);

        get.set(backendStateAtom(arg.backend), {
          ...get(backendStateAtom(arg.backend)),
          sessions: patchSession(get(backendStateAtom(arg.backend)).sessions, arg.sessionId, session => ({
            ...session,
            status: 'inactive',
          })),
        });

        if (get(selectedSessionIdAtom) === arg.sessionId) {
          get.set(selectedSessionIdAtom, undefined);
        }
      },
      (effect, arg) =>
        effect.pipe(
          Effect.tapError(error => Effect.logError('deactivateSession failed', arg.backend, arg.sessionId, error)),
        ),
    ),
  )
  .pipe(Atom.keepAlive);

export const deleteSessionFn = acpRuntime
  .fn(
    Effect.fn('deleteSessionFn')(
      function* (arg: { backend: AcpAgentBackend; sessionId: string }, get: AcpAtomGet) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
          'ao.action': 'user.deleteSession',
          'ao.action.kind': 'user',
        });
        const agent = getAgentHandle(arg.backend);
        if (agent === undefined) {
          yield* Effect.logWarning('deleteSession skipped; no agent', arg.backend);
          return;
        }

        const snapshot = get(backendStateAtom(arg.backend));
        if (arg.sessionId in snapshot.sessions && snapshot.sessions[arg.sessionId].status !== 'inactive') {
          yield* Effect.logWarning('deleteSession refused; session not inactive', arg.backend, arg.sessionId);
          return;
        }

        yield* Effect.logInfo('Deleting session', arg.backend, arg.sessionId);
        yield* deleteSession(agent, arg.sessionId);

        const { [arg.sessionId]: _removed, ...remainingSessions } = snapshot.sessions;
        const sessionRoster = snapshot.sessionRoster.filter(entry => entry.sessionId !== arg.sessionId);

        get.set(backendStateAtom(arg.backend), {
          ...snapshot,
          sessionRoster,
          sessions: remainingSessions,
        });

        if (get(selectedSessionIdAtom) === arg.sessionId) {
          get.set(selectedSessionIdAtom, undefined);
        }
      },
      (effect, arg) =>
        effect.pipe(
          Effect.tapError(error => Effect.logError('deleteSessionFn failed', arg.backend, arg.sessionId, error)),
        ),
    ),
  )
  .pipe(Atom.keepAlive);

export const sendChatItemFn = acpRuntime
  .fn(
    Effect.fn('sendChatItemFn')(function* (arg: { backend: AcpAgentBackend; text: string }, get: AcpAtomGet) {
      const trimmed = arg.text.trim();
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendStateAtom(arg.backend));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];

      if (trimmed.length === 0 || session?.status !== 'active') {
        return;
      }

      yield* Effect.annotateCurrentSpan({
        'acp.agent': arg.backend,
        'acp.sessionId': session.sessionId,
        'ao.action': 'user.sendPrompt',
        'ao.action.kind': 'user',
      });

      const chatItems = appendBackendUserChatItem(arg.backend, session.sessionId, trimmed);
      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          chatItems,
        })),
      });

      yield* withSessionClientRequest(
        arg.backend,
        get,
        session.sessionId,
        Effect.gen(function* () {
          const agent = getAgentHandle(arg.backend);
          if (agent === undefined) {
            return;
          }
          yield* sendPrompt(arg.backend, agent, session.sessionId, trimmed);
        }),
      );
    }),
  )
  .pipe(Atom.keepAlive);

export const respondElicitationFn = acpRuntime
  .fn(
    (
      arg: {
        backend: AcpAgentBackend;
        response: CreateElicitationResponseBody;
        sessionId: string;
      },
      get,
    ) => {
      const parent = getPromptSpan(arg.backend, arg.sessionId);
      return Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
          'ao.action': 'user.respondElicitation',
          'ao.action.kind': 'user',
        });
        const snapshot = get(backendStateAtom(arg.backend));
        const pending = snapshot.sessions[arg.sessionId].pendingElicitation;
        if (pending === undefined) {
          return;
        }
        pending.resolve(arg.response);
        get.set(backendStateAtom(arg.backend), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, arg.sessionId, current => ({
            ...current,
            pendingElicitation: undefined,
          })),
        });
      }).pipe(Effect.withSpan('respondElicitationFn', parent !== undefined ? { parent } : { root: true }));
    },
  )
  .pipe(Atom.keepAlive);

export const respondPermissionFn = acpRuntime
  .fn(
    (
      arg: {
        backend: AcpAgentBackend;
        optionId: string;
        sessionId: string;
      },
      get,
    ) => {
      const parent = getPromptSpan(arg.backend, arg.sessionId);
      return Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
          'ao.action': 'user.respondPermission',
          'ao.action.kind': 'user',
        });
        const snapshot = get(backendStateAtom(arg.backend));
        const pending = snapshot.sessions[arg.sessionId].pendingPermission;
        if (pending === undefined) {
          return;
        }
        pending.resolve({ outcome: { optionId: arg.optionId, outcome: 'selected' } });
        get.set(backendStateAtom(arg.backend), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, arg.sessionId, current => ({
            ...current,
            pendingPermission: undefined,
          })),
        });
      }).pipe(Effect.withSpan('respondPermissionFn', parent !== undefined ? { parent } : { root: true }));
    },
  )
  .pipe(Atom.keepAlive);

export const restartBackendFn = acpRuntime
  .fn(
    Effect.fn('restartBackendFn')(function* (backend: AcpAgentBackend, get: AcpAtomGet) {
      yield* Effect.annotateCurrentSpan({
        'acp.agent': backend,
        'ao.action': 'user.restartBackend',
        'ao.action.kind': 'user',
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

export const setConfigOptionFn = acpRuntime
  .fn(
    Effect.fn('setConfigOptionFn')(function* (
      arg: { backend: AcpAgentBackend; configId: string; value: string },
      get: AcpAtomGet,
    ) {
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendStateAtom(arg.backend));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];
      const currentValue = normalizeConfigOptions(session?.sessionState).find(
        option => option.id === arg.configId,
      )?.currentValue;

      if (session?.status !== 'active' || currentValue === arg.value) {
        return;
      }

      yield* Effect.annotateCurrentSpan({
        'acp.agent': arg.backend,
        'acp.sessionId': session.sessionId,
        'ao.action': 'user.setConfigOption',
        'ao.action.kind': 'user',
      });

      const previousModeId = session.selectedModeId;
      const previousModelId = session.selectedModelId;
      const previousSessionState = session.sessionState;
      const patchedSessionState = patchConfigOptionValue(session.sessionState, arg.configId, arg.value);
      const selection = selectionFromSessionConfiguration(patchedSessionState);

      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          selectedModeId: selection.selectedModeId ?? current.selectedModeId,
          selectedModelId: selection.selectedModelId ?? current.selectedModelId,
          sessionState: patchedSessionState,
        })),
      });

      const rpc = Effect.gen(function* () {
        const agent = getAgentHandle(arg.backend);
        if (agent === undefined) {
          return;
        }

        const result = yield* setConfigOption(agent, session.sessionId, arg.configId, arg.value);
        const currentSnapshot = get(backendStateAtom(arg.backend));
        const applied = applySetConfigOptionResult(currentSnapshot.sessions[session.sessionId].sessionState, result);
        syncProviderConfigFromSessionConfiguration(get, arg.backend, applied.sessionState);
        get.set(backendStateAtom(arg.backend), {
          ...currentSnapshot,
          sessions: patchSession(currentSnapshot.sessions, session.sessionId, current => ({
            ...current,
            selectedModeId: applied.selectedModeId ?? current.selectedModeId,
            selectedModelId: applied.selectedModelId ?? current.selectedModelId,
            sessionState: applied.sessionState,
          })),
        });
      });

      yield* withSessionClientRequest(arg.backend, get, session.sessionId, rpc).pipe(
        Effect.tapError(error =>
          Effect.gen(function* () {
            yield* Effect.logError('setConfigOptionFn failed; rolling back', arg.backend, arg.configId, error);
            get.set(backendStateAtom(arg.backend), {
              ...get(backendStateAtom(arg.backend)),
              sessions: patchSession(get(backendStateAtom(arg.backend)).sessions, session.sessionId, current => ({
                ...current,
                selectedModeId: previousModeId,
                selectedModelId: previousModelId,
                sessionState: previousSessionState,
              })),
            });
          }),
        ),
      );
    }),
  )
  .pipe(Atom.keepAlive);

export const saveHarnessDefaultsFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend }, get) =>
    Effect.sync(() => {
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendStateAtom(arg.backend));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];
      if (session?.status !== 'active') {
        return;
      }

      const values = defaultsFromSelectable(normalizeSelectableConfigOptions(session.sessionState));
      if (Object.keys(values).length === 0) {
        return;
      }

      const next = saveHarnessDefaults(arg.backend, values);
      get.set(providerConfigAtom(arg.backend), next);
    }),
  )
  .pipe(Atom.keepAlive);
