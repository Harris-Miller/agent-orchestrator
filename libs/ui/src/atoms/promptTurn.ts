/**
 * Prompt turn: one prompt from Send to its stop reason (glossary: Prompt turn, Steering, Queued message, Prompt turn cancel,
 * Attention event; desktop ADR-0018 steer, ADR-0020 queue).
 *
 * Interface:
 * - {@link sendPromptTurn}: start a Prompt turn and run it to its stop reason.
 * - {@link steerPromptTurn}: Steering into the in-flight turn; on `promptRequired`, a Send once the ended turn is done.
 * - {@link awaitTurnEnd}: wait for the in-flight turn to be over (the Queued message waits on it).
 * - {@link cancelPromptTurn}: Prompt turn cancel. No-op unless a prompt is in flight or a Background follow-up runs.
 *
 * Invariants:
 * 1. Atomic start. A Send begins only if the Composer action rule decides Send (and Bootstrap is usable), in the same
 *    snapshot write that sets the Pending client request and appends the user message stamped `startedAt`. A refused
 *    Send fails with {@link ComposerActionUnavailable} and leaves the snapshot unchanged.
 * 2. One end. Success, Request error, failure or interrupt: one write clears the Pending client request and Prompt turn
 *    cancel and stamps `endedAt` on that turn's user message (a Request error joins the transcript in that same write).
 *    A Session dropped mid-turn stays dropped.
 * 3. Soft-cancel. A `session/prompt` failure after Prompt turn cancel succeeds as `{ stopReason: 'cancelled' }`, even if
 *    the Agent's answer was a Request error.
 * 4. Attention. Exactly one turn-end Attention event (fire-and-forget) for a stop reason other than `cancelled`; none on
 *    failure or a Request error, unless the caller is the Harness running a Spawned subagent session, which has no
 *    turn-ended Attention (native children never had one).
 * 5. Steering. Only when the Composer action rule decides Steer (and Bootstrap is usable). `injected` appends a Steering user message (no turn
 *    timing) and leaves the Pending client request alone. Any other outcome waits (bounded, no polling) until the
 *    Session has no Pending client request, then runs a full Send; on timeout it fails with
 *    {@link ComposerActionUnavailable} and appends nothing.
 * 6. Cancel. Only while a prompt is in flight: resolves the current Pending interactions as cancelled (clearing only
 *    those), sets Prompt turn cancel, marks non-finished tool calls cancelled, then sends `session/cancel`.
 * 7. Same turn for every caller: Composer Send, the Virtual first Send, the Steer fallback and Handoff all start turns
 *    only through {@link sendPromptTurn}.
 *
 * Request error. The Agent answering `session/prompt` (or `_session/steering`) with a JSON-RPC error response is a valid
 * outcome, not a failure: a turn ends as `{ _tag: 'Rejected' }` with the Request error in the Session's transcript;
 * Steering fails with {@link SteeringRejected} (nothing injected, so the caller can put the draft back).
 *
 * Error modes: {@link ComposerActionUnavailable} (refused, or the Steer fallback timed out); {@link SteeringRejected};
 * `ImageAttachmentRejected` (prompt blocks); `BackendNotConnected` and other RPC errors. After a turn has begun, its
 * user message stays; the Steer fallback wraps any other failure of its Send in {@link SteerFallbackTurnFailed} so
 * callers can tell it apart.
 */
import type { AcpError, SessionFailure, StopReason } from '@libs/effect-acp';
import { Clock, Effect, Exit, Option, Schema, Stream } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import type { ComposerAction } from '../host/composerAction.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';
import { promptBlocksFromComposerDraft } from '../host/draftToContentBlocks.ts';
import {
  appendRequestError,
  appendSteeredMessage,
  applySessionFailure,
  beginPromptTurn,
  clearCancelledInteractions,
  endPromptTurn,
  requestPromptCancel,
  sessionTurnAction,
} from '../host/harnessStateTransitions.ts';
import { sessionFailureOf } from '../host/airMeta.ts';
import { isAttentionStopReason, notifySessionAttention } from '../host/notifyAttention.ts';
import { elicitationsOf, permissionsOf } from '../host/pendingInteractions.ts';
import { acpErrorOfCause } from '../host/requestError.ts';
import { sessionHasLiveWork } from '../host/subagent.ts';
import { cancelSession, sendPrompt, steerSession } from '../host/sessionRpc.ts';
import type { UserMessageImageRef } from '../host/sessionUpdateReducer.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { modifyHarnessSnapshot, updateHarnessSnapshot } from './harnessSnapshot.ts';
import { reportRequestError } from './reportRequestError.ts';
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

/** The Agent's refusal of a `_session/steering` message: it is in the Session's chat, and was not injected. */
export class SteeringRejected extends Schema.TaggedError<SteeringRejected>()('SteeringRejected', {
  message: Schema.String,
}) {}

/** How a started Prompt turn ended: the Agent's stop reason, or its error response (the Request error is in the chat). */
export type PromptTurnResult =
  | { readonly _tag: 'Ended'; readonly failure?: SessionFailure; readonly stopReason: StopReason }
  | { readonly _tag: 'Rejected'; readonly error: AcpError };

export type PromptTurnInput = {
  readonly attachments?: readonly ComposerImageAttachment[];
  readonly launchTarget: AgentLaunchTarget;
  /** `false` only for a Spawned subagent session's turn: no turn-ended Attention event (default on). */
  readonly notifyTurnEnd?: false;
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

/** A session's entry in a snapshot's `sessions`, if any. */
export const sessionById = <S>(sessions: Readonly<Record<string, S>>, sessionId: string): S | undefined =>
  sessionId in sessions ? sessions[sessionId] : undefined;

/** The session's entry in its launch target's snapshot, if any. */
export const sessionIn = (registry: Registry, launchTarget: AgentLaunchTarget, sessionId: string) =>
  sessionById(snapshotOf(registry, launchTarget).sessions, sessionId);

/** Prompt blocks → `session/prompt` → soft-cancel → turn-end Attention event. */
const runPrompt = Effect.fnUntraced(function* (
  registry: Registry,
  { attachments, launchTarget, sessionId, text }: Required<Omit<PromptTurnInput, 'notifyTurnEnd'>>,
  notifyTurnEnd: boolean,
) {
  const prompt = yield* promptBlocksFromComposerDraft(text, {
    attachments,
    cwd: sessionIn(registry, launchTarget, sessionId)?.cwd,
    agentCapabilities: snapshotOf(registry, launchTarget).agentCapabilities,
  });

  const exit = yield* Effect.exit(sendPrompt(launchTarget, sessionId, prompt));
  if (Exit.isSuccess(exit)) {
    const { stopReason } = exit.value;
    const failure = Option.getOrUndefined(sessionFailureOf(exit.value._meta));
    if (notifyTurnEnd && isAttentionStopReason(stopReason)) {
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
    return {
      _tag: 'Ended',
      ...(failure === undefined ? {} : { failure }),
      stopReason,
    } satisfies PromptTurnResult;
  }
  if (sessionIn(registry, launchTarget, sessionId)?.promptCancelRequested === true) {
    yield* Effect.logDebug('session/prompt error after Prompt turn cancel', launchTarget, sessionId, exit.cause);
    return { _tag: 'Ended', stopReason: 'cancelled' } satisfies PromptTurnResult;
  }
  const error = acpErrorOfCause(exit.cause);
  return error === undefined
    ? yield* Effect.failCause(exit.cause)
    : ({ _tag: 'Rejected', error } satisfies PromptTurnResult);
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
      return yield* restore(
        runPrompt(registry, { attachments, launchTarget, sessionId, text }, input.notifyTurnEnd !== false),
      ).pipe(
        Effect.onExit(exit =>
          Effect.flatMap(Clock.currentTimeMillis, endedAt =>
            Effect.sync(() => {
              const result = Exit.isSuccess(exit) ? exit.value : undefined;
              updateHarnessSnapshot(registry, launchTarget, current => {
                const ended = endPromptTurn(current, sessionId, begun.turnId, endedAt);
                if (result?._tag === 'Rejected') {
                  return appendRequestError(ended, sessionId, { error: result.error, method: 'session/prompt' });
                }
                // Same write as the turn end (invariant 2); a failure already seen via `session_info_update` is a no-op.
                return result?.failure === undefined ? ended : applySessionFailure(ended, sessionId, result.failure);
              });
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
  const result = yield* steerSession(launchTarget, sessionId, prompt).pipe(
    reportRequestError(registry, input, '_session/steering'),
  );
  if (result === undefined) {
    return yield* new SteeringRejected({ message: 'The Agent rejected the Steering message' });
  }

  if (result.outcome === 'injected') {
    // A steered message joins the in-flight turn: no turn timing, Pending client request untouched (ADR-0018).
    const images = slimImageRefsFromAttachments(attachments);
    updateHarnessSnapshot(registry, launchTarget, current => appendSteeredMessage(current, sessionId, text, images));
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

/**
 * Prompt turn cancel. No-op unless a prompt is in flight or a Background follow-up runs on that Session; with no turn
 * there is nothing to soft-cancel, so only the Pending interactions and the agent are cancelled.
 */
export const cancelPromptTurn = Effect.fnUntraced(function* (
  registry: Registry,
  { launchTarget, sessionId }: { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string },
) {
  yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget, 'acp.sessionId': sessionId });
  const session = sessionIn(registry, launchTarget, sessionId);
  const inTurn = session?.pendingClientRequest === 'prompt';
  if (session === undefined || !sessionHasLiveWork(snapshotOf(registry, launchTarget), session)) {
    return;
  }

  // Every Pending interaction shown or waiting now; the writer cancels them on the agent. One raised meanwhile stays answerable.
  const cancelled = { elicitations: elicitationsOf(session), permissions: permissionsOf(session) };
  updateHarnessSnapshot(registry, launchTarget, current =>
    inTurn
      ? requestPromptCancel(current, sessionId, cancelled)
      : clearCancelledInteractions(current, sessionId, cancelled),
  );

  yield* cancelSession(launchTarget, sessionId);
});
