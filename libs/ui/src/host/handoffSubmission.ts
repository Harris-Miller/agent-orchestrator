/**
 * How a Handoff receives its document: the source session's agent calls the hub's `submit_handoff` tool, which lands
 * here as a tool call from that session. Only a call made while the Handoff is waiting counts, so output from earlier
 * turns can never be picked up and nothing is parsed out of the transcript.
 */
import { SubmitHandoffArgs } from '@lib/hub/protocol';
import { Deferred, Effect } from 'effect';
import type { Scope } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { hubToolHandler, toolError } from './hubToolHandler.ts';

const key = (launchTarget: AgentLaunchTarget, sessionId: string) => `${launchTarget}\u0000${sessionId}`;

const pending = new Map<string, Deferred.Deferred<string>>();

/** Wait for `sessionId`'s `submit_handoff` until the Scope closes; the Deferred holds the document. */
export const expectHandoff = (
  launchTarget: AgentLaunchTarget,
  sessionId: string,
): Effect.Effect<Deferred.Deferred<string>, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const deferred = Deferred.makeUnsafe<string>();
      pending.set(key(launchTarget, sessionId), deferred);
      return deferred;
    }),
    () =>
      Effect.sync(() => {
        pending.delete(key(launchTarget, sessionId));
      }),
  );

export const submitHandoffHandler = hubToolHandler(SubmitHandoffArgs, ({ document }, caller) =>
  Effect.gen(function* () {
    const waiting = pending.get(key(caller.launchTarget, caller.sessionId));
    if (waiting === undefined) {
      return toolError('No handoff was requested for this session, so nothing was submitted.');
    }
    return (yield* Deferred.succeed(waiting, document))
      ? { isError: false, text: 'Handoff document received.' }
      : toolError('A handoff document was already submitted.');
  }),
);
