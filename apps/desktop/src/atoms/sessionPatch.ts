/** Session snapshot patch helpers shared by ACP atom actions. */
import { Effect } from 'effect';

import { initialSessionSnapshot, selectionFromSessionConfiguration } from '../acp/acpSessionBootstrap.ts';
import type { SessionSnapshot } from '../acp/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../acp/agentHarness.ts';
import { getAgentHandle } from '../acp/agentHarness.ts';
import { refreshCatalogFromSessionConfiguration } from '../acp/providerConfigStorage.ts';

import type { AcpAtomGet } from './acpRuntime.ts';
import { backendHarnessStateAtom, providerConfigAtom } from './backendStateAtoms.ts';

export const syncProviderConfigFromSessionConfiguration = (
  get: AcpAtomGet,
  backend: AgentLaunchTarget,
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
    cwd: existing?.cwd,
    pendingClientRequest: false,
    selectedModeId: selection.selectedModeId,
    selectedModelId: selection.selectedModelId,
    sessionConfiguration: result,
    sessionId,
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
  backend: AgentLaunchTarget,
  get: AcpAtomGet,
  sessionId: string,
  rpc: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const snapshot = get(backendHarnessStateAtom(backend));
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

    get.set(backendHarnessStateAtom(backend), {
      ...snapshot,
      sessions: patchSession(snapshot.sessions, sessionId, current => ({
        ...current,
        pendingClientRequest: true,
      })),
    });

    return yield* rpc.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          const currentSnapshot = get(backendHarnessStateAtom(backend));
          get.set(backendHarnessStateAtom(backend), {
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
