/**
 * Prompt turn: one prompt from Send to its stop reason (glossary: Prompt turn, Steering, Queued message, Prompt turn cancel,
 * Attention event; desktop ADR-0018 steer, ADR-0020 queue).
 *
 * Interface:
 * - {@link sendPromptTurn}: start a Prompt turn and run it to its stop reason.
 * - {@link steerPromptTurn}: Steering into the in-flight turn; on `promptRequired`, a Send once the ended turn is done.
 * - {@link awaitTurnEnd}: wait for the in-flight turn to be over (the Queued message waits on it).
 * - {@link cancelPromptTurn}: Prompt turn cancel. No-op unless a prompt is in flight on that Session.
 *
 * Invariants:
 * 1. Atomic start. A Send begins only if the Composer action rule decides Send (and Bootstrap is usable), in the same
 *    snapshot write that sets the Pending client request and appends the user message stamped `startedAt`. A refused
 *    Send fails with {@link ComposerActionUnavailable} and leaves the snapshot unchanged.
 * 2. One end. Success, failure or interrupt: one write clears the Pending client request and Prompt turn cancel and
 *    stamps `endedAt` on that turn's user message. A Session dropped mid-turn stays dropped.
 * 3. Soft-cancel. A `session/prompt` failure after Prompt turn cancel succeeds as `{ stopReason: 'cancelled' }`.
 * 4. Attention. Exactly one turn-end Attention event (fire-and-forget) for a stop reason other than `cancelled`; none on
 *    failure.
 * 5. Steering. Only when the Composer action rule decides Steer (and Bootstrap is usable). `injected` appends a Steering user message (no turn
 *    timing) and leaves the Pending client request alone. Any other outcome waits (bounded, no polling) until the
 *    Session has no Pending client request, then runs a full Send; on timeout it fails with
 *    {@link ComposerActionUnavailable} and appends nothing.
 * 6. Cancel. Only while a prompt is in flight: resolves the current Pending interactions as cancelled (clearing only
 *    those), sets Prompt turn cancel, marks non-finished tool calls cancelled, then sends `session/cancel`.
 * 7. Same turn for every caller: Composer Send, the Virtual first Send, the Steer fallback and Handoff all start turns
 *    only through {@link sendPromptTurn}.
 *
 * Error modes: {@link ComposerActionUnavailable} (refused, or the Steer fallback timed out); `ImageAttachmentRejected`
 * (prompt blocks); `BackendNotConnected` and RPC errors. After a turn has begun, its user message stays; the Steer
 * fallback wraps any other failure of its Send in {@link SteerFallbackTurnFailed} so callers can tell it apart.
 */
import { Clock, Effect, Exit, Option, Schema, Stream } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { ComposerAction } from '../host/composerAction.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';
import { promptBlocksFromComposerDraft } from '../host/draftToContentBlocks.ts';
import { beginPromptTurn, endPromptTurn, sessionTurnAction } from '../host/harnessStateTransitions.ts';
import { isAttentionStopReason, notifySessionAttention } from '../host/notifyAttention.ts';
import { cancelSession, sendPrompt, steerSession } from '../host/sessionRpc.ts';
import { patchSession } from '../host/sessionSnapshot.ts';
import { appendUserChatMessage, markNonFinishedToolCallsCancelled } from '../host/sessionUpdateReducer.ts';
import type { UserMessageImageRef } from '../host/sessionUpdateReducer.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { modifyHarnessSnapshot, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { currentUserSettings } from './userSettings/userSettingsDocument.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

/** A Send or Steering was refused because the Composer action rule does not decide that action right now. */
export class ComposerActionUnavailable extends Schema.TaggedError<ComposerActionUnavailable>()(
  'ComposerActionUnavailable',
  { message: Schema.String },
) {}

/** The Steer fallback's Send failed for a reason other than a refusal: its turn may have begun (user message stays). */
export class SteerFallbackTurnFailed extends Schema.TaggedError<SteerFallbackTurnFailed>()('SteerFallbackTurnFailed', {
  cause: Schema.Defect(),
}) {}

export type PromptTurnInput = {
  readonly attachments?: readonly ComposerImageAttachment[];
  readonly launchTarget: AgentLaunchTarget;
  readonly sessionId: string;
  readonly text: string;
};

/** How long the Steer fallback waits for the ended turn's `session/prompt` response. */
const ENDED_TURN_TIMEOUT = '5 seconds';

const slimImageRefsFromAttachments = (
  attachments: readonly ComposerImageAttachment[],
): readonly UserMessageImageRef[] =>
  attachments.map(attachment => ({
    mimeType: attachment.mimeType,
    name: attachment.name,
    previewDataUrl: attachment.previewDataUrl,
    uri: attachment.uri,
  }));

const refusal = (verb: 'Sending' | 'Steering', action: ComposerAction) =>
  new ComposerActionUnavailable({
    message: `${verb} is not available for this session right now (${action._tag === 'Unavailable' ? action.reason : action._tag})`,
  });

const snapshotOf = (registry: Registry, launchTarget: AgentLaunchTarget) =>
  registry.get(backendHarnessSnapshotAtom(launchTarget));

const sessionIn = (registry: Registry, launchTarget: AgentLaunchTarget, sessionId: string) => {
  const { sessions } = snapshotOf(registry, launchTarget);
  return sessionId in sessions ? sessions[sessionId] : undefined;
};

/** Prompt blocks → `session/prompt` → soft-cancel → turn-end Attention event. */
const runPrompt = Effect.fnUntraced(function* (
  registry: Registry,
  { attachments, launchTarget, sessionId, text }: Required<PromptTurnInput>,
) {
  const prompt = yield* promptBlocksFromComposerDraft(text, {
    attachments,
    cwd: sessionIn(registry, launchTarget, sessionId)?.cwd,
    agentCapabilities: snapshotOf(registry, launchTarget).agentCapabilities,
  });

  const exit = yield* Effect.exit(sendPrompt(launchTarget, sessionId, prompt));
  if (Exit.isSuccess(exit)) {
    const { stopReason } = exit.value;
    if (isAttentionStopReason(stopReason)) {
      yield* Effect.forkDetach(
        notifySessionAttention(
          currentUserSettings(registry),
          snapshotOf(registry, launchTarget),
          launchTarget,
          sessionId,
          {
            kind: 'turn-ended',
            stopReason,
          },
        ),
      );
    }
    return { stopReason };
  }
  if (sessionIn(registry, launchTarget, sessionId)?.promptCancelRequested === true) {
    yield* Effect.logDebug('session/prompt error after Prompt turn cancel', launchTarget, sessionId, exit.cause);
    return { stopReason: 'cancelled' };
  }
  return yield* Effect.failCause(exit.cause);
});

/** Start a Prompt turn and run it to its stop reason. */
export const sendPromptTurn = Effect.fn('sendPromptTurn')(function* (registry: Registry, input: PromptTurnInput) {
  const text = input.text.trim();
  const attachments = input.attachments ?? [];
  const { launchTarget, sessionId } = input;
  const startedAt = yield* Clock.currentTimeMillis;
  yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget, 'acp.sessionId': sessionId });
  // Begin and installing the end run uninterruptibly: no interrupt can land between them (invariant 2).
  return yield* Effect.uninterruptibleMask(restore =>
    Effect.gen(function* () {
      const begun = modifyHarnessSnapshot(registry, launchTarget, current => {
        const result = beginPromptTurn(current, sessionId, {
          images: slimImageRefsFromAttachments(attachments),
          startedAt,
          text,
        });
        return [result, result._tag === 'Begun' ? result.snapshot : current];
      });
      if (begun._tag === 'Refused') {
        return yield* refusal('Sending', begun.action);
      }
      return yield* restore(runPrompt(registry, { attachments, launchTarget, sessionId, text })).pipe(
        Effect.ensuring(
          Effect.flatMap(Clock.currentTimeMillis, endedAt =>
            Effect.sync(() => {
              updateHarnessSnapshot(registry, launchTarget, current =>
                endPromptTurn(current, sessionId, begun.turnId, endedAt),
              );
            }),
          ),
        ),
      );
    }),
  );
});

/** Resolves once `sessionId` is gone, not active, or has no Pending client request (the Prompt turn is over). */
export const awaitTurnEnd = (registry: Registry, launchTarget: AgentLaunchTarget, sessionId: string) =>
  AtomRegistry.toStream(registry, backendHarnessSnapshotAtom(launchTarget)).pipe(
    Stream.filter(
      ({ sessions }) =>
        !(sessionId in sessions) ||
        sessions[sessionId].status !== 'active' ||
        sessions[sessionId].pendingClientRequest === undefined,
    ),
    Stream.runHead,
  );

/** {@link awaitTurnEnd}, failing after {@link ENDED_TURN_TIMEOUT}. */
const awaitNoClientRequest = Effect.fnUntraced(function* (
  registry: Registry,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
) {
  const settled = yield* awaitTurnEnd(registry, launchTarget, sessionId).pipe(Effect.timeoutOption(ENDED_TURN_TIMEOUT));
  if (Option.isNone(settled)) {
    return yield* new ComposerActionUnavailable({
      message: 'Steering is not available: the previous Prompt turn did not finish',
    });
  }
});

/** Steering into the in-flight Prompt turn; on `promptRequired`, Send once the ended turn has finished. */
export const steerPromptTurn = Effect.fn('steerPromptTurn')(function* (registry: Registry, input: PromptTurnInput) {
  const text = input.text.trim();
  const attachments = input.attachments ?? [];
  const { launchTarget, sessionId } = input;
  const snapshot = snapshotOf(registry, launchTarget);
  const session = sessionId in snapshot.sessions ? snapshot.sessions[sessionId] : undefined;
  const action = sessionTurnAction(snapshot, sessionId, {
    hasContent: text.length > 0 || attachments.length > 0,
    steeringSupported: snapshot.agentCapabilities.steeringSupported,
  });
  if (action._tag !== 'Steer' || session === undefined) {
    return yield* refusal('Steering', action);
  }

  yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget, 'acp.sessionId': sessionId });
  const prompt = yield* promptBlocksFromComposerDraft(text, {
    attachments,
    cwd: session.cwd,
    agentCapabilities: snapshot.agentCapabilities,
  });
  const result = yield* steerSession(launchTarget, sessionId, prompt);

  if (result.outcome === 'injected') {
    // A steered message joins the in-flight turn: no turn timing, Pending client request untouched (ADR-0018).
    const images = slimImageRefsFromAttachments(attachments);
    updateHarnessSnapshot(registry, launchTarget, current =>
      sessionId in current.sessions
        ? {
            ...current,
            sessions: patchSession(current.sessions, sessionId, s => ({
              ...s,
              transcript: appendUserChatMessage(s.transcript, text, images.length > 0 ? images : undefined, {
                steering: true,
              }),
            })),
          }
        : current,
    );
    return;
  }
  yield* Effect.logDebug('_session/steering fell back to session/prompt', result.outcome);
  // The ended turn's `session/prompt` response may still be in flight; Send once it has cleared the request.
  yield* awaitNoClientRequest(registry, launchTarget, sessionId);
  yield* sendPromptTurn(registry, input).pipe(
    Effect.mapError(error =>
      error instanceof ComposerActionUnavailable ? error : new SteerFallbackTurnFailed({ cause: error }),
    ),
  );
});

/** Prompt turn cancel. No-op unless a prompt is in flight on that Session. */
export const cancelPromptTurn = Effect.fnUntraced(function* (
  registry: Registry,
  { launchTarget, sessionId }: { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string },
) {
  yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget, 'acp.sessionId': sessionId });
  const session = sessionIn(registry, launchTarget, sessionId);
  if (session?.pendingClientRequest !== 'prompt') {
    return;
  }

  const { pendingElicitation, pendingPermission } = session;
  pendingPermission?.resolve({ outcome: { outcome: 'cancelled' } });
  pendingElicitation?.resolve({ action: 'cancel' });

  // Clear only the interactions just cancelled: one the agent raised during `resolve` stays answerable.
  updateHarnessSnapshot(registry, launchTarget, current =>
    sessionId in current.sessions
      ? {
          ...current,
          sessions: patchSession(current.sessions, sessionId, s => ({
            ...s,
            pendingElicitation: s.pendingElicitation === pendingElicitation ? undefined : s.pendingElicitation,
            pendingPermission: s.pendingPermission === pendingPermission ? undefined : s.pendingPermission,
            promptCancelRequested: true,
            transcript: markNonFinishedToolCallsCancelled(s.transcript),
          })),
        }
      : current,
  );

  yield* cancelSession(launchTarget, sessionId);
});
