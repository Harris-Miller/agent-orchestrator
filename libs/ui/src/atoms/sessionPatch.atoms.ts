/** Session snapshot patch helpers + session client request orchestration. */
import { Effect, Exit } from 'effect';
import type { Atom } from 'effect/unstable/reactivity';

import type { PendingClientRequestKind } from '../acp/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';
import { sendPrompt } from '../acp/sessionRpc.ts';

import { backendHarnessStateAtom } from './backendState.atoms.ts';
import { patchSession, upsertSession } from './sessionSnapshot.ts';

export { patchSession, upsertSession };

/** session/prompt; soft-succeed with cancelled if Prompt turn cancel was requested. */
export const sendPromptSoftCancel = Effect.fn('sendPromptSoftCancel')(function* (
  launchTarget: AgentLaunchTarget,
  get: Atom.FnContext,
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
  get: Atom.FnContext,
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
