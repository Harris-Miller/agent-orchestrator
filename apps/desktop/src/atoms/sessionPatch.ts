/** Session snapshot patch helpers shared by ACP atom actions. */
import { Effect } from 'effect';

import {
  initialSessionSnapshot,
  selectionFromSessionConfiguration,
} from '../prototype/agentChat/acpSessionBootstrap.ts';
import type { SessionSnapshot } from '../prototype/agentChat/acpSessionBootstrap.ts';
import type { AcpAgentBackend } from '../prototype/agentChat/agentHarness.ts';
import { getAgentHandle } from '../prototype/agentChat/agentHarness.ts';
import { refreshCatalogFromSessionConfiguration } from '../prototype/agentChat/providerConfigStorage.ts';

import type { AcpAtomGet } from './acpRuntime.ts';
import { backendStateAtom, providerConfigAtom } from './backendStateAtoms.ts';

export const syncProviderConfigFromSessionConfiguration = (
  get: AcpAtomGet,
  backend: AcpAgentBackend,
  sessionConfiguration: unknown,
) => {
  const next = refreshCatalogFromSessionConfiguration(backend, sessionConfiguration);
  get.set(providerConfigAtom(backend), next);
};

export const applySessionActivationResult = (
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

export const upsertSession = (
  sessions: Readonly<Record<string, SessionSnapshot>>,
  session: SessionSnapshot,
): Readonly<Record<string, SessionSnapshot>> => ({
  ...sessions,
  [session.sessionId]: session,
});

export const patchSession = (
  sessions: Readonly<Record<string, SessionSnapshot>>,
  sessionId: string,
  patch: (current: SessionSnapshot) => SessionSnapshot,
): Readonly<Record<string, SessionSnapshot>> => {
  const current = sessions[sessionId] ?? initialSessionSnapshot(sessionId);
  return upsertSession(sessions, patch(current));
};

export const withSessionClientRequest = <A, E, R>(
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
