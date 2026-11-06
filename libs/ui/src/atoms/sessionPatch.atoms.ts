/** Session snapshot patch helpers + session client request orchestration. */
import { Effect, Exit } from 'effect';
import type { Atom } from 'effect/reactivity';

import type { PendingClientRequestKind } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';
import { promptBlocksFromComposerDraft } from '../host/draftToContentBlocks.ts';
import { beginClientRequest, endClientRequest } from '../host/harnessStateTransitions.ts';
import { isAttentionStopReason, notifySessionAttention } from '../host/notifyAttention.ts';
import { sendPrompt } from '../host/sessionRpc.ts';
import { patchSession, upsertSession } from '../host/sessionSnapshot.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { modifyHarnessSnapshot, updateHarnessSnapshot } from './harnessSnapshot.ts';

export { patchSession, upsertSession };

/** session/prompt; soft-succeed with cancelled if Prompt turn cancel was requested. */
export const sendPromptSoftCancel = Effect.fn('sendPromptSoftCancel')(function* (
  launchTarget: AgentLaunchTarget,
  get: Atom.FnContext,
  sessionId: string,
  text: string,
  attachments: readonly ComposerImageAttachment[] = [],
) {
  const snapshot = get(backendHarnessSnapshotAtom(launchTarget));
  const session = snapshot.sessions[sessionId];
  const prompt = yield* promptBlocksFromComposerDraft(text, {
    attachments,
    cwd: session.cwd,
    initializeResult: snapshot.initializeResult,
  });

  const exit = yield* Effect.exit(sendPrompt(launchTarget, sessionId, prompt));
  if (Exit.isSuccess(exit)) {
    const { stopReason } = exit.value;
    if (isAttentionStopReason(stopReason)) {
      yield* Effect.forkDetach(
        notifySessionAttention(get(backendHarnessSnapshotAtom(launchTarget)), launchTarget, sessionId, {
          kind: 'turn-ended',
          stopReason,
        }),
      );
    }
    return exit.value;
  }
  if (get(backendHarnessSnapshotAtom(launchTarget)).sessions[sessionId].promptCancelRequested === true) {
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
