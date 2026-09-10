/** Session snapshot patch helpers shared by ACP atom actions. */
import { Effect } from 'effect';

import { initialSessionSnapshot, selectionFromSessionConfiguration } from '../acp/acpSessionBootstrap.ts';
import type { SessionSnapshot } from '../acp/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';
import { refreshCatalogFromSessionConfiguration } from '../acp/providerConfigStorage.ts';
import { emptySessionTranscript } from '../acp/sessionUpdateReducer.ts';

import type { AcpAtomGet } from './acpRuntime.ts';
import { backendHarnessStateAtom, providerConfigAtom } from './backendStateAtoms.ts';

export const syncProviderConfigFromSessionConfiguration = (
  get: AcpAtomGet,
  launchTarget: AgentLaunchTarget,
  sessionConfiguration: unknown,
) => {
  const next = refreshCatalogFromSessionConfiguration(launchTarget, sessionConfiguration);
  get.set(providerConfigAtom(launchTarget), next);
};

/** Fields carried forward across activation merges (create may pass only `{ cwd }`). */
type SessionActivationCarry = Partial<Pick<SessionSnapshot, 'availableCommands' | 'cwd' | 'transcript' | 'usage'>>;

export const applySessionActivationResult = (
  sessionId: string,
  result: unknown,
  existing?: SessionActivationCarry,
): SessionSnapshot => {
  const selection = selectionFromSessionConfiguration(result);
  return {
    availableCommands: existing?.availableCommands,
    cwd: existing?.cwd,
    pendingClientRequest: false,
    selectedModeId: selection.selectedModeId,
    selectedModelId: selection.selectedModelId,
    sessionConfiguration: result,
    sessionId,
    status: 'active',
    transcript: existing?.transcript ?? emptySessionTranscript(),
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
  launchTarget: AgentLaunchTarget,
  get: AcpAtomGet,
  sessionId: string,
  rpc: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const snapshot = get(backendHarnessStateAtom(launchTarget));
    const session = snapshot.sessions[sessionId];

    if (
      snapshot.phase !== 'ready' ||
      session.status !== 'active' ||
      session.pendingClientRequest === true ||
      session.pendingElicitation !== undefined ||
      session.pendingPermission !== undefined
    ) {
      yield* Effect.logDebug('Skipping session client request', launchTarget, sessionId, {
        pendingClientRequest: session.pendingClientRequest === true,
        pendingElicitation: session.pendingElicitation !== undefined,
        pendingPermission: session.pendingPermission !== undefined,
        phase: snapshot.phase,
        status: session.status,
      });
      return undefined as A;
    }

    get.set(backendHarnessStateAtom(launchTarget), {
      ...snapshot,
      sessions: patchSession(snapshot.sessions, sessionId, current => ({
        ...current,
        pendingClientRequest: true,
      })),
    });

    return yield* rpc.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          const currentSnapshot = get(backendHarnessStateAtom(launchTarget));
          get.set(backendHarnessStateAtom(launchTarget), {
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
