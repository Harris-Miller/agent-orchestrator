/** Session snapshot patch helpers shared by ACP atom actions. */
import { Effect, Exit } from 'effect';

import { initialSessionSnapshot } from '../acp/acpSessionBootstrap.ts';
import type { PendingClientRequestKind, SessionSnapshot } from '../acp/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';
import {
  defaultsEqual,
  patchHarnessConfigDefaults,
  persistProviderConfigDocuments,
  refreshProviderConfigInMemory,
} from '../acp/providerConfigStorage.ts';
import { sendPrompt } from '../acp/sessionRpc.ts';

import type { AcpAtomGet } from './acpRuntime.ts';
import { backendHarnessStateAtom, providerConfigAtom } from './backendStateAtoms.ts';
import { settingsDocumentAtom } from './settingsAtoms.ts';

export const syncProviderConfigFromSessionConfiguration = (
  get: AcpAtomGet,
  launchTarget: AgentLaunchTarget,
  sessionConfiguration: unknown,
) => {
  const settings = get(settingsDocumentAtom);
  const settingsDefaults = settings.harnessConfigDefaults?.[launchTarget] ?? {};
  const previous = get(providerConfigAtom(launchTarget));
  const next = refreshProviderConfigInMemory(previous, settingsDefaults, sessionConfiguration);
  if (next === undefined) {
    return;
  }

  get.set(providerConfigAtom(launchTarget), next);

  const defaultsChanged = !defaultsEqual(settingsDefaults, next.defaults);
  const nextSettings = defaultsChanged ? patchHarnessConfigDefaults(settings, launchTarget, next.defaults) : settings;
  if (defaultsChanged) {
    get.set(settingsDocumentAtom, nextSettings);
  }

  persistProviderConfigDocuments(launchTarget, next, nextSettings, defaultsChanged);
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

/** session/prompt; soft-succeed with cancelled if Prompt turn cancel was requested. */
export const sendPromptSoftCancel = Effect.fn('sendPromptSoftCancel')(function* (
  launchTarget: AgentLaunchTarget,
  get: AcpAtomGet,
  sessionId: string,
  text: string,
) {
  const exit = yield* Effect.exit(sendPrompt(launchTarget, sessionId, text));
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  if (get(backendHarnessStateAtom(launchTarget)).sessions[sessionId].promptCancelRequested === true) {
    yield* Effect.logDebug('session/prompt error after Prompt turn cancel', launchTarget, sessionId, exit.cause);
    return { stopReason: 'cancelled' as const };
  }
  return yield* Effect.failCause(exit.cause);
});

export const withSessionClientRequest = <A, E, R>(
  launchTarget: AgentLaunchTarget,
  get: AcpAtomGet,
  sessionId: string,
  kind: PendingClientRequestKind,
  rpc: Effect.Effect<A, E, R>,
): Effect.Effect<A | undefined, E, R> =>
  Effect.gen(function* () {
    const snapshot = get(backendHarnessStateAtom(launchTarget));
    const session = snapshot.sessions[sessionId];

    if (
      snapshot.phase !== 'ready' ||
      session.status !== 'active' ||
      session.pendingClientRequest !== undefined ||
      session.pendingElicitation !== undefined ||
      session.pendingPermission !== undefined
    ) {
      yield* Effect.logDebug('Skipping session client request', launchTarget, sessionId, {
        pendingClientRequest: session.pendingClientRequest,
        pendingElicitation: session.pendingElicitation !== undefined,
        pendingPermission: session.pendingPermission !== undefined,
        phase: snapshot.phase,
        status: session.status,
      });
      return undefined;
    }

    get.set(backendHarnessStateAtom(launchTarget), {
      ...snapshot,
      sessions: patchSession(snapshot.sessions, sessionId, current => ({
        ...current,
        pendingClientRequest: kind,
      })),
    });

    return yield* rpc.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          // Atom.fn dispose marks get disposed before interrupt finalizers; disposed get.set no-ops.
          get.registry.update(backendHarnessStateAtom(launchTarget), current => ({
            ...current,
            sessions: patchSession(current.sessions, sessionId, entry => ({
              ...entry,
              pendingClientRequest: undefined,
              promptCancelRequested: undefined,
            })),
          }));
        }),
      ),
    );
  });
