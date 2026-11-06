/** Chat effects (Send, Steering) and prompt-cancel / permission / elicitation / config Atom fns. */
import type { CreateElicitationResponseBody } from '@libs/effect-acp';
import { Clock, Effect, Schema } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import {
  applySetConfigOptionResult,
  hasSteeringSupport,
  normalizeConfigOptions,
  patchConfigOptionValue,
  selectionFromSessionConfiguration,
} from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { withUserChatMessage } from '../host/applySessionUpdate.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';
import { promptBlocksFromComposerDraft } from '../host/draftToContentBlocks.ts';
import { getPromptSpan } from '../host/promptSpanRegistry.ts';
import { canCancelSubagent, getSubagent } from '../host/subagent.ts';
import { patchSessionOrSubagent, sessionOrSubagentOf } from '../host/subagentRouting.ts';
import { cancelSession, setConfigOption, steerSession } from '../host/sessionRpc.ts';
import { turnAction } from '../host/composerAction.ts';
import {
  appendElicitationSummary,
  markNonFinishedToolCallsCancelled,
  stampUserMessageTiming,
} from '../host/sessionUpdateReducer.ts';
import type { ElicitationSummary, TurnTiming, UserMessageImageRef } from '../host/sessionUpdateReducer.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { selectedActiveSessionAtom } from './selectedActiveSession.atoms.ts';
import { patchSession, sendPromptSoftCancel, withSessionClientRequest } from './sessionPatch.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { setVirtualConfigOption } from './virtualSession.atoms.ts';

export const slimImageRefsFromAttachments = (
  attachments: readonly ComposerImageAttachment[],
): readonly UserMessageImageRef[] =>
  attachments.map(attachment => ({
    mimeType: attachment.mimeType,
    name: attachment.name,
    previewDataUrl: attachment.previewDataUrl,
    uri: attachment.uri,
  }));

/** A Send or Steering was refused because {@link turnAction} does not decide that Composer action right now. */
export class ComposerActionUnavailable extends Schema.TaggedError<ComposerActionUnavailable>()(
  'ComposerActionUnavailable',
  { message: Schema.String },
) {}

/** The Composer action {@link turnAction} decides for this draft on `arg.sessionId`, with the session it read. */
const turnActionFor = (
  arg: {
    attachments?: readonly ComposerImageAttachment[];
    launchTarget: AgentLaunchTarget;
    sessionId: string | undefined;
  },
  trimmed: string,
  get: Atom.FnContext,
) => {
  const snapshot = get(backendHarnessSnapshotAtom(arg.launchTarget));
  const session = arg.sessionId === undefined ? undefined : snapshot.sessions[arg.sessionId];
  const action = turnAction(session, {
    hasContent: trimmed.length > 0 || (arg.attachments ?? []).length > 0,
    steeringSupported: hasSteeringSupport(snapshot.initializeResult),
  });
  return { action, session, snapshot };
};

/**
 * Send the draft as a new prompt turn. Fails before appending the user message unless {@link turnAction} is Send, so
 * the Harness never prompts a Session the Composer would not offer Send for.
 */
export const sendChatItemEffect = Effect.fn('sendChatItemEffect')(function* (
  arg: {
    attachments?: readonly ComposerImageAttachment[];
    launchTarget: AgentLaunchTarget;
    sessionId: string | undefined;
    text: string;
  },
  get: Atom.FnContext,
) {
  const trimmed = arg.text.trim();
  const attachments = arg.attachments ?? [];
  const { action, session } = turnActionFor(arg, trimmed, get);

  if (action._tag !== 'Send' || session === undefined) {
    return yield* new ComposerActionUnavailable({ message: 'Sending is not available for this session right now' });
  }

  yield* Effect.annotateCurrentSpan({
    'acp.agent': arg.launchTarget,
    'acp.sessionId': session.sessionId,
  });

  const images = slimImageRefsFromAttachments(attachments);
  updateHarnessSnapshot(get.registry, arg.launchTarget, current => ({
    ...current,
    sessions: patchSession(current.sessions, session.sessionId, s =>
      withUserChatMessage(s, trimmed, images.length > 0 ? images : undefined),
    ),
  }));

  const turnId = get(backendHarnessSnapshotAtom(arg.launchTarget)).sessions[session.sessionId].transcript.items.at(
    -1,
  )?.id;
  const stamp = (patch: TurnTiming) =>
    turnId === undefined
      ? Effect.void
      : Effect.sync(() => {
          updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
            session.sessionId in current.sessions
              ? {
                  ...current,
                  sessions: patchSession(current.sessions, session.sessionId, s => ({
                    ...s,
                    transcript: stampUserMessageTiming(s.transcript, turnId, patch),
                  })),
                }
              : current,
          );
        });
  yield* stamp({ startedAt: yield* Clock.currentTimeMillis });

  yield* withSessionClientRequest(
    arg.launchTarget,
    get,
    session.sessionId,
    'prompt',
    sendPromptSoftCancel(arg.launchTarget, get, session.sessionId, trimmed, attachments).pipe(
      Effect.ensuring(Effect.flatMap(Clock.currentTimeMillis, endedAt => stamp({ endedAt }))),
    ),
  );
});

const PROMPT_CLEAR_MAX_POLLS = 50;
const PROMPT_CLEAR_POLL_INTERVAL = '100 millis';

/**
 * `_session/steering` into the in-flight turn. Fails unless {@link turnAction} is Steer (so the caller restores the
 * draft). `promptRequired` (turn already ended) falls back to a normal prompt.
 * A steered message joins the in-flight turn, so it gets no turn timing of its own.
 */
export const steerChatItemEffect = Effect.fn('steerChatItemEffect')(function* (
  arg: {
    attachments?: readonly ComposerImageAttachment[];
    launchTarget: AgentLaunchTarget;
    sessionId: string | undefined;
    text: string;
  },
  get: Atom.FnContext,
) {
  const trimmed = arg.text.trim();
  const attachments = arg.attachments ?? [];
  const { action, session, snapshot } = turnActionFor(arg, trimmed, get);

  if (action._tag !== 'Steer' || session === undefined) {
    // Caller already cleared the draft; fail so it restores instead of silently dropping the message.
    return yield* new ComposerActionUnavailable({ message: 'Steering is not available for this session right now' });
  }

  yield* Effect.annotateCurrentSpan({
    'acp.agent': arg.launchTarget,
    'acp.sessionId': session.sessionId,
  });

  const prompt = yield* promptBlocksFromComposerDraft(trimmed, {
    attachments,
    cwd: session.cwd,
    initializeResult: snapshot.initializeResult,
  });
  const result = yield* steerSession(arg.launchTarget, session.sessionId, prompt);

  if (result.outcome === 'injected') {
    updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
      session.sessionId in current.sessions
        ? {
            ...current,
            sessions: patchSession(current.sessions, session.sessionId, s =>
              withUserChatMessage(
                s,
                trimmed,
                attachments.length > 0 ? slimImageRefsFromAttachments(attachments) : undefined,
                { steering: true },
              ),
            ),
          }
        : current,
    );
    return;
  }
  yield* Effect.logDebug('_session/steering fell back to session/prompt', result.outcome);
  // The ended turn's `session/prompt` response may still be in flight; sending now would be skipped
  // by beginClientRequest after the user message was appended. Wait (bounded) for it to clear.
  for (let attempt = 0; ; attempt += 1) {
    const { sessions } = get(backendHarnessSnapshotAtom(arg.launchTarget));
    if (!(session.sessionId in sessions)) {
      return yield* Effect.fail(new Error('Session was removed while steering'));
    }
    const current = sessions[session.sessionId];
    if (current.pendingClientRequest === undefined) {
      break;
    }
    if (attempt >= PROMPT_CLEAR_MAX_POLLS) {
      // Caller restores the draft; sending now would append a user message that is never sent.
      return yield* Effect.fail(new Error('Previous prompt turn did not finish; steering message not sent'));
    }
    yield* Effect.sleep(PROMPT_CLEAR_POLL_INTERVAL);
  }
  yield* sendChatItemEffect(arg, get);
});

export type ElicitationReply =
  | { response: Extract<CreateElicitationResponseBody, { action: 'accept' }>; summary: ElicitationSummary }
  | { response: Extract<CreateElicitationResponseBody, { action: 'decline' | 'cancel' }> };

export const createChatAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  const cancelPromptAtomFn = atomRuntime
    .fn(
      Effect.fnUntraced(
        function* (arg: { launchTarget: AgentLaunchTarget; sessionId: string }, get: Atom.FnContext) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': arg.launchTarget,
            'acp.sessionId': arg.sessionId,
          });

          const snapshot = get(backendHarnessSnapshotAtom(arg.launchTarget));
          const session = snapshot.sessions[arg.sessionId];
          if (session.pendingClientRequest !== 'prompt') {
            return;
          }

          const { pendingPermission } = session;
          const { pendingElicitation } = session;

          if (pendingPermission !== undefined) {
            pendingPermission.resolve({ outcome: { outcome: 'cancelled' } });
          }
          if (pendingElicitation !== undefined) {
            pendingElicitation.resolve({ action: 'cancel' });
          }

          // Clear only the interactions just cancelled: one the agent raised during `resolve` stays answerable.
          updateHarnessSnapshot(get.registry, arg.launchTarget, current => ({
            ...current,
            sessions: patchSession(current.sessions, arg.sessionId, s => ({
              ...s,
              pendingElicitation: s.pendingElicitation === pendingElicitation ? undefined : s.pendingElicitation,
              pendingPermission: s.pendingPermission === pendingPermission ? undefined : s.pendingPermission,
              promptCancelRequested: true,
              transcript: markNonFinishedToolCallsCancelled(s.transcript),
            })),
          }));

          yield* cancelSession(arg.launchTarget, arg.sessionId);
        },
        Effect.withSpan('cancelPromptAtomFn', arg => {
          const parent = getPromptSpan(arg.launchTarget, arg.sessionId);
          return parent !== undefined ? { parent } : { root: true };
        }),
      ),
    )
    .pipe(Atom.keepAlive);

  /** Child cancel: only with a current `cancel: {}` grant; never touches root prompt state. */
  const cancelSubagentAtomFn = atomRuntime
    .fn(
      Effect.fnUntraced(
        function* (arg: { launchTarget: AgentLaunchTarget; sessionId: string }, get: Atom.FnContext) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': arg.launchTarget,
            'acp.sessionId': arg.sessionId,
          });
          const child = getSubagent(get(backendHarnessSnapshotAtom(arg.launchTarget)).subagents, arg.sessionId);
          if (child === undefined || !canCancelSubagent(child)) {
            return;
          }
          yield* cancelSession(arg.launchTarget, arg.sessionId);
        },
        Effect.withSpan('cancelSubagentAtomFn', arg => {
          const parent = getPromptSpan(arg.launchTarget, arg.sessionId);
          return parent !== undefined ? { parent } : { root: true };
        }),
      ),
    )
    .pipe(Atom.keepAlive);

  type RespondElicitationArg = {
    launchTarget: AgentLaunchTarget;
    sessionId: string;
  } & ElicitationReply;

  const respondElicitationAtomFn = atomRuntime
    .fn(
      Effect.fnUntraced(
        function* (arg: RespondElicitationArg, get: Atom.FnContext) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': arg.launchTarget,
            'acp.sessionId': arg.sessionId,
          });
          const snapshot = get(backendHarnessSnapshotAtom(arg.launchTarget));
          const pending = sessionOrSubagentOf(snapshot, arg.sessionId)?.pendingElicitation;
          if (pending === undefined) {
            return;
          }
          pending.resolve(arg.response);
          // Clear only the elicitation answered: one the agent raised during `resolve` stays answerable.
          updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
            sessionOrSubagentOf(current, arg.sessionId) === undefined
              ? current
              : patchSessionOrSubagent(current, arg.sessionId, holder => ({
                  ...holder,
                  pendingElicitation: holder.pendingElicitation === pending ? undefined : holder.pendingElicitation,
                  transcript:
                    'summary' in arg ? appendElicitationSummary(holder.transcript, arg.summary) : holder.transcript,
                })),
          );
        },
        Effect.withSpan('respondElicitationAtomFn', arg => {
          const parent = getPromptSpan(arg.launchTarget, arg.sessionId);
          return parent !== undefined ? { parent } : { root: true };
        }),
      ),
    )
    .pipe(Atom.keepAlive);

  const respondPermissionAtomFn = atomRuntime
    .fn(
      Effect.fnUntraced(
        function* (
          arg: {
            launchTarget: AgentLaunchTarget;
            optionId: string;
            sessionId: string;
          },
          get: Atom.FnContext,
        ) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': arg.launchTarget,
            'acp.sessionId': arg.sessionId,
          });
          const snapshot = get(backendHarnessSnapshotAtom(arg.launchTarget));
          const pending = sessionOrSubagentOf(snapshot, arg.sessionId)?.pendingPermission;
          if (pending === undefined) {
            return;
          }
          pending.resolve({ outcome: { optionId: arg.optionId, outcome: 'selected' } });
          updateHarnessSnapshot(get.registry, arg.launchTarget, current =>
            sessionOrSubagentOf(current, arg.sessionId)?.pendingPermission === pending
              ? patchSessionOrSubagent(current, arg.sessionId, holder => ({ ...holder, pendingPermission: undefined }))
              : current,
          );
        },
        Effect.withSpan('respondPermissionAtomFn', arg => {
          const parent = getPromptSpan(arg.launchTarget, arg.sessionId);
          return parent !== undefined ? { parent } : { root: true };
        }),
      ),
    )
    .pipe(Atom.keepAlive);

  const setConfigOptionAtomFn = atomRuntime
    .fn(
      Effect.fn('setConfigOptionAtomFn', { root: true })(function* (
        arg:
          | { configId: string; launchTarget: AgentLaunchTarget; type: 'boolean'; value: boolean }
          | { configId: string; launchTarget: AgentLaunchTarget; type: 'select'; value: string },
        get: Atom.FnContext,
      ) {
        if (get(selectedAtom)?._tag === 'Virtual') {
          return yield* setVirtualConfigOption(get.registry, arg);
        }

        // Session arm only.
        const sessionId = get(selectedActiveSessionAtom)?.sessionId;
        const snapshot = get(backendHarnessSnapshotAtom(arg.launchTarget));
        const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];
        const currentValue = normalizeConfigOptions(session?.sessionConfiguration).find(
          option => option.id === arg.configId,
        )?.currentValue;

        if (session?.status !== 'active' || currentValue === arg.value) {
          return;
        }

        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.launchTarget,
          'acp.sessionId': session.sessionId,
        });

        const previousModeId = session.selectedModeId;
        const previousModelId = session.selectedModelId;
        const previousSessionState = session.sessionConfiguration;

        updateHarnessSnapshot(get.registry, arg.launchTarget, current => ({
          ...current,
          sessions: patchSession(current.sessions, session.sessionId, s => {
            const patched = patchConfigOptionValue(s.sessionConfiguration, arg.configId, arg.value);
            const selection = selectionFromSessionConfiguration(patched);
            return {
              ...s,
              selectedModeId: selection.selectedModeId ?? s.selectedModeId,
              selectedModelId: selection.selectedModelId ?? s.selectedModelId,
              sessionConfiguration: patched,
            };
          }),
        }));

        const rpc = Effect.gen(function* () {
          const result = yield* setConfigOption(
            arg.launchTarget,
            session.sessionId,
            arg.configId,
            arg.type === 'boolean' ? { type: 'boolean', value: arg.value } : { type: 'select', value: arg.value },
          );
          updateHarnessSnapshot(get.registry, arg.launchTarget, current => ({
            ...current,
            sessions: patchSession(current.sessions, session.sessionId, s => {
              const applied = applySetConfigOptionResult(s.sessionConfiguration, result);
              return {
                ...s,
                selectedModeId: applied.selectedModeId ?? s.selectedModeId,
                selectedModelId: applied.selectedModelId ?? s.selectedModelId,
                sessionConfiguration: applied.sessionConfiguration,
              };
            }),
          }));
        });

        yield* withSessionClientRequest(arg.launchTarget, get, session.sessionId, 'config', rpc).pipe(
          Effect.tapError(error =>
            Effect.gen(function* () {
              yield* Effect.logError(
                'setConfigOptionAtomFn failed; rolling back',
                arg.launchTarget,
                arg.configId,
                error,
              );
              updateHarnessSnapshot(get.registry, arg.launchTarget, current => ({
                ...current,
                sessions: patchSession(current.sessions, session.sessionId, s => ({
                  ...s,
                  selectedModeId: previousModeId,
                  selectedModelId: previousModelId,
                  sessionConfiguration: previousSessionState,
                })),
              }));
            }),
          ),
        );
      }),
    )
    .pipe(Atom.keepAlive);

  return {
    cancelPromptAtomFn,
    cancelSubagentAtomFn,
    respondElicitationAtomFn,
    respondPermissionAtomFn,
    setConfigOptionAtomFn,
  };
};
