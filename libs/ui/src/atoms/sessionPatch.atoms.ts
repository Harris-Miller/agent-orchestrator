/** Session client request orchestration (Session Config). */
import { Effect } from 'effect';
import type { Atom } from 'effect/reactivity';

import type { PendingClientRequestKind } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { beginClientRequest, endClientRequest } from '../host/harnessStateTransitions.ts';

import { modifyHarnessSnapshot, updateHarnessSnapshot } from './harnessSnapshot.ts';

export const withSessionClientRequest = <A, E, R>(
  launchTarget: AgentLaunchTarget,
  get: Atom.FnContext,
  sessionId: string,
  kind: PendingClientRequestKind,
  rpc: Effect.Effect<A, E, R>,
): Effect.Effect<A | undefined, E, R> =>
  Effect.gen(function* () {
    const refusedSnapshot = modifyHarnessSnapshot(get.registry, launchTarget, current => {
      const begun = beginClientRequest(current, sessionId, kind);
      return begun === undefined ? [current, current] : [undefined, begun];
    });
    if (refusedSnapshot !== undefined) {
      const session = sessionId in refusedSnapshot.sessions ? refusedSnapshot.sessions[sessionId] : undefined;
      yield* Effect.logDebug('Skipping session client request', launchTarget, sessionId, {
        pendingClientRequest: session?.pendingClientRequest,
        pendingElicitation: session?.pendingElicitation !== undefined,
        pendingPermission: session?.pendingPermission !== undefined,
        phase: refusedSnapshot.phase,
        status: session?.status,
      });
      return undefined;
    }

    return yield* rpc.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          updateHarnessSnapshot(get.registry, launchTarget, current => endClientRequest(current, sessionId));
        }),
      ),
    );
  });
