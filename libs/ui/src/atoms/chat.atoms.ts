/** Chat prompt / permission / elicitation / config Atom fns. */
import type { CreateElicitationResponseBody } from '@libs/effect-acp';
import { Clock, Effect, Exit } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import {
  applySetConfigOptionResult,
  hasSteeringSupport,
  isUsablePhase,
  normalizeConfigOptions,
  patchConfigOptionValue,
  selectionFromSessionConfiguration,
} from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { needsLazyHydrate } from '../host/configOptionIndexUi.ts';
import { withUserChatMessage } from '../host/applySessionUpdate.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';
import { promptBlocksFromComposerDraft } from '../host/draftToContentBlocks.ts';
import { upsertIntoSnapshot } from '../host/harnessStateTransitions.ts';
import { getPromptSpan } from '../host/promptSpanRegistry.ts';
import { canCancelSubagent, getSubagent } from '../host/subagent.ts';
import { patchSessionOrSubagent, sessionOrSubagentOf } from '../host/subagentRouting.ts';
import { applyConfigDiffs, buildActivatedSession, historyEntryFromNew } from '../host/sessionMaterialize.ts';
import type { ConfigValueDiff } from '../host/sessionMaterialize.ts';
import { cancelSession, setConfigOption, steerSession } from '../host/sessionRpc.ts';
import {
  appendElicitationSummary,
  markNonFinishedToolCallsCancelled,
  stampUserMessageTiming,
} from '../host/sessionUpdateReducer.ts';
import type { ElicitationSummary, TurnTiming, UserMessageImageRef } from '../host/sessionUpdateReducer.ts';

import {
  backendHarnessStateAtom,
  configOptionIndexAtom,
  ProviderUnavailable,
  selectedAtom,
  selectedSessionIdAtom,
  virtualMaterializingAtom,
  virtualSendPendingAtom,
} from './backendState.atoms.ts';
import { selectedActiveSessionAtom } from './selectedActiveSession.atoms.ts';
import { patchSession, sendPromptSoftCancel, withSessionClientRequest } from './sessionPatch.atoms.ts';
import { awaitCurrentVirtualBind, awaitProviderSettled, requestVirtualBind, rwFromFnContext } from './virtualBind.ts';
import {
  hasComposerContent,
  lastCreateDefaultsAtom,
  patchVirtualConfigValue,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

export const draftAtom = Atom.family((_sessionId: string) => Atom.make('').pipe(Atom.keepAlive));

export const composerAttachmentsAtom = Atom.family((_sessionId: string) =>
  Atom.make<readonly ComposerImageAttachment[]>([]).pipe(Atom.keepAlive),
);

export const slimImageRefsFromAttachments = (
  attachments: readonly ComposerImageAttachment[],
): readonly UserMessageImageRef[] =>
  attachments.map(attachment => ({
    mimeType: attachment.mimeType,
    name: attachment.name,
    previewDataUrl: attachment.previewDataUrl,
    uri: attachment.uri,
  }));

const sendChatItemEffect = Effect.fn('sendChatItemEffect')(function* (
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
  const { sessionId } = arg;
  const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
  const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];

  if ((trimmed.length === 0 && attachments.length === 0) || session?.status !== 'active') {
    return;
  }

  yield* Effect.annotateCurrentSpan({
    'acp.agent': arg.launchTarget,
    'acp.sessionId': session.sessionId,
  });

  const images = slimImageRefsFromAttachments(attachments);
  get.set(backendHarnessStateAtom(arg.launchTarget), {
    ...snapshot,
    sessions: patchSession(snapshot.sessions, session.sessionId, current =>
      withUserChatMessage(current, trimmed, images.length > 0 ? images : undefined),
    ),
  });

  const turnId = get(backendHarnessStateAtom(arg.launchTarget)).sessions[session.sessionId].transcript.items.at(-1)?.id;
  const stamp = (patch: TurnTiming) =>
    turnId === undefined
      ? Effect.void
      : Effect.sync(() => {
          // Disposed Atom.fn context makes get.set a no-op; registry.update still lands.
          get.registry.update(backendHarnessStateAtom(arg.launchTarget), current =>
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
 * `_session/steering` into the in-flight turn. Needs steering support, a `prompt` pending request and no
 * Pending interaction; otherwise no-op. `promptRequired` (turn already ended) falls back to a normal prompt.
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
  const { sessionId } = arg;
  const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
  const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];

  if (
    (trimmed.length === 0 && attachments.length === 0) ||
    session?.status !== 'active' ||
    session.pendingClientRequest !== 'prompt' ||
    session.promptCancelRequested === true ||
    session.pendingElicitation !== undefined ||
    session.pendingPermission !== undefined ||
    !hasSteeringSupport(snapshot.initializeResult)
  ) {
    // Caller already cleared the draft; fail so it restores instead of silently dropping the message.
    return yield* Effect.fail(new Error('Steering is not available for this session right now'));
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
    get.registry.update(backendHarnessStateAtom(arg.launchTarget), current =>
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
    const { sessions } = get(backendHarnessStateAtom(arg.launchTarget));
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

  const sendChatItemAtomFn = atomRuntime
    .fn(
      Effect.fn('sendChatItemAtomFn', { root: true })(function* (
        arg: { attachments?: readonly ComposerImageAttachment[]; launchTarget: AgentLaunchTarget; text: string },
        get: Atom.FnContext,
      ) {
        yield* sendChatItemEffect({ ...arg, sessionId: get(selectedSessionIdAtom) }, get);
      }),
    )
    .pipe(Atom.keepAlive);

  const steerChatItemAtomFn = atomRuntime
    .fn(
      Effect.fn('steerChatItemAtomFn', {
        root: true,
      })(function* (
        arg: { attachments?: readonly ComposerImageAttachment[]; launchTarget: AgentLaunchTarget; text: string },
        get: Atom.FnContext,
      ) {
        yield* steerChatItemEffect({ ...arg, sessionId: get(selectedSessionIdAtom) }, get);
      }),
    )
    .pipe(Atom.keepAlive);

  /**
   * First Send on Virtual: await provider `usable`, then the latest Bind (requesting one if none), then apply
   * Virtual Config → history Materialize → draft copy → clear virtual + Select Session → sendChatItem.
   * Re-awaits when the blob churns meanwhile. The draft stays on the blob until Materialize succeeds; failures
   * (provider `error`, Bind failure) reject so callers report via `onClientError`. `virtualSendPendingAtom` blocks
   * double-submit. Materialize lock ends before session/prompt.
   */
  const materializeVirtualThenSendAtomFn = atomRuntime
    .fn(
      Effect.fn('materializeVirtualThenSendAtomFn', { root: true })(function* (_arg: undefined, get: Atom.FnContext) {
        if (get(virtualMaterializingAtom) || get(virtualSendPendingAtom) || get(selectedAtom)?._tag !== 'Virtual') {
          return;
        }
        const initial = get(virtualSessionAtom);
        if (initial === null || !hasComposerContent(initial)) {
          return;
        }

        const rw = rwFromFnContext(get);
        get.set(virtualSendPendingAtom, true);
        const target = yield* Effect.gen(function* () {
          for (;;) {
            const virtual = get(virtualSessionAtom);
            if (virtual?.launchTarget === undefined || virtual.cwd === undefined || !hasComposerContent(virtual)) {
              return undefined;
            }
            const { cwd, launchTarget } = virtual;
            const { failure, phase } = get(backendHarnessStateAtom(launchTarget));
            if (phase === 'error') {
              return yield* new ProviderUnavailable({ message: failure?.message ?? 'Provider unavailable' });
            }
            if (!isUsablePhase(phase)) {
              yield* awaitProviderSettled(get.registry, launchTarget);
              continue;
            }

            yield* requestVirtualBind(rw);
            const boundId = yield* awaitCurrentVirtualBind(rw);
            const latest = get(virtualSessionAtom);
            if (latest?.launchTarget !== launchTarget || latest.cwd !== cwd) {
              continue;
            }
            if (boundId === undefined || latest.sessionId !== boundId) {
              return yield* new ProviderUnavailable({ message: 'Could not start a session for this provider' });
            }
            return { ...latest, cwd, launchTarget, sessionId: boundId };
          }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              get.set(virtualSendPendingAtom, false);
            }),
          ),
        );
        if (target === undefined) {
          return;
        }
        const virtual = target;
        const { attachments, cwd, draft, launchTarget, sessionId } = virtual;

        const materialized = yield* Effect.gen(function* () {
          get.set(virtualMaterializingAtom, true);
          yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
          yield* Effect.annotateCurrentSpan('acp.sessionId', sessionId);
          yield* Effect.logInfo('UI materializeVirtualThenSend', launchTarget, { cwd, sessionId });

          const liveSnapshot = get(backendHarnessStateAtom(launchTarget));
          if (!(sessionId in liveSnapshot.sessions) || liveSnapshot.sessions[sessionId].status !== 'active') {
            yield* Effect.logError('materializeVirtualThenSend missing Bound session', launchTarget, sessionId);
            return undefined;
          }
          const liveSession = liveSnapshot.sessions[sessionId];

          const setOption = (diff: ConfigValueDiff) =>
            setConfigOption(
              launchTarget,
              sessionId,
              diff.configId,
              diff.type === 'boolean' ? { type: 'boolean', value: diff.value } : { type: 'select', value: diff.value },
            );
          const afterOverrides = yield* applyConfigDiffs(
            liveSession.sessionConfiguration,
            virtual.configValues,
            setOption,
          );
          if (afterOverrides.stoppedEarly) {
            yield* Effect.logWarning(
              'materializeVirtualThenSend applyConfigDiffs stopped early',
              launchTarget,
              sessionId,
            );
          }

          const historyEntry = historyEntryFromNew({ sessionId }, liveSession.cwd ?? cwd);
          const configuredSnapshot = get(backendHarnessStateAtom(launchTarget));
          get.set(
            backendHarnessStateAtom(launchTarget),
            upsertIntoSnapshot(configuredSnapshot, {
              historyEntry,
              session: buildActivatedSession(sessionId, afterOverrides.sessionConfiguration, {
                availableCommands: liveSession.availableCommands,
                cwd: liveSession.cwd ?? cwd,
                transcript: liveSession.transcript,
                usage: liveSession.usage,
              }),
            }),
          );

          get.set(lastCreateDefaultsAtom, { configValues: virtual.configValues, launchTarget });
          get.set(draftAtom(sessionId), draft);
          get.set(composerAttachmentsAtom(sessionId), attachments);
          get.set(virtualSessionAtom, null);
          // User may have navigated away mid-Materialize; only follow the draft if still on Virtual.
          if (get(selectedAtom)?._tag === 'Virtual') {
            get.set(selectedAtom, { _tag: 'Session', sessionId });
          }
          return { attachments, draft, launchTarget, sessionId } as const;
        }).pipe(
          Effect.tapError(error => Effect.logError('materializeVirtualThenSendAtomFn failed', error)),
          Effect.ensuring(
            Effect.sync(() => {
              get.set(virtualMaterializingAtom, false);
            }),
          ),
        );

        if (materialized === undefined) {
          return;
        }

        get.set(composerAttachmentsAtom(materialized.sessionId), []);
        get.set(draftAtom(materialized.sessionId), '');
        yield* sendChatItemEffect(
          {
            attachments: materialized.attachments,
            launchTarget: materialized.launchTarget,
            sessionId: materialized.sessionId,
            text: materialized.draft,
          },
          get,
        );
      }),
      // A second call must not interrupt the pending Send (it no-ops on `virtualSendPendingAtom`).
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  const cancelPromptAtomFn = atomRuntime
    .fn(
      Effect.fnUntraced(
        function* (arg: { launchTarget: AgentLaunchTarget; sessionId: string }, get: Atom.FnContext) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': arg.launchTarget,
            'acp.sessionId': arg.sessionId,
          });

          const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
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

          get.set(backendHarnessStateAtom(arg.launchTarget), {
            ...snapshot,
            sessions: patchSession(snapshot.sessions, arg.sessionId, current => ({
              ...current,
              pendingElicitation: undefined,
              pendingPermission: undefined,
              promptCancelRequested: true,
              transcript: markNonFinishedToolCallsCancelled(current.transcript),
            })),
          });

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
          const child = getSubagent(get(backendHarnessStateAtom(arg.launchTarget)).subagents, arg.sessionId);
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
          const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
          const pending = sessionOrSubagentOf(snapshot, arg.sessionId)?.pendingElicitation;
          if (pending === undefined) {
            return;
          }
          pending.resolve(arg.response);
          get.set(
            backendHarnessStateAtom(arg.launchTarget),
            patchSessionOrSubagent(snapshot, arg.sessionId, current => ({
              ...current,
              pendingElicitation: undefined,
              transcript:
                'summary' in arg ? appendElicitationSummary(current.transcript, arg.summary) : current.transcript,
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
          const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
          const pending = sessionOrSubagentOf(snapshot, arg.sessionId)?.pendingPermission;
          if (pending === undefined) {
            return;
          }
          pending.resolve({ outcome: { optionId: arg.optionId, outcome: 'selected' } });
          get.set(
            backendHarnessStateAtom(arg.launchTarget),
            patchSessionOrSubagent(snapshot, arg.sessionId, current => ({
              ...current,
              pendingPermission: undefined,
            })),
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
          // Virtual (Bound or not): blob only. Materialize's applyConfigDiffs pushes it to the live session on Send.
          // Exception: an advertised model with no hydrated row yet is picked on the Bound session so its row is learned.
          const boundSessionId = get(virtualSessionAtom)?.sessionId;
          if (
            arg.type === 'select' &&
            arg.configId === 'model' &&
            boundSessionId !== undefined &&
            needsLazyHydrate(get(configOptionIndexAtom(arg.launchTarget)), boundSessionId, arg.value)
          ) {
            const pick = yield* Effect.exit(
              setConfigOption(arg.launchTarget, boundSessionId, 'model', { type: 'select', value: arg.value }),
            );
            if (Exit.isFailure(pick)) {
              return;
            }
          }
          patchVirtualConfigValue(
            rwFromFnContext(get),
            get(configOptionIndexAtom(arg.launchTarget)),
            arg.configId,
            arg.value,
          );
          return;
        }

        // Session arm only.
        const sessionId = get(selectedActiveSessionAtom)?.sessionId;
        const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
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
        const patchedSessionState = patchConfigOptionValue(session.sessionConfiguration, arg.configId, arg.value);
        const selection = selectionFromSessionConfiguration(patchedSessionState);

        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
            ...current,
            selectedModeId: selection.selectedModeId ?? current.selectedModeId,
            selectedModelId: selection.selectedModelId ?? current.selectedModelId,
            sessionConfiguration: patchedSessionState,
          })),
        });

        const rpc = Effect.gen(function* () {
          const result = yield* setConfigOption(
            arg.launchTarget,
            session.sessionId,
            arg.configId,
            arg.type === 'boolean' ? { type: 'boolean', value: arg.value } : { type: 'select', value: arg.value },
          );
          const currentSnapshot = get(backendHarnessStateAtom(arg.launchTarget));
          const applied = applySetConfigOptionResult(
            currentSnapshot.sessions[session.sessionId].sessionConfiguration,
            result,
          );
          get.set(backendHarnessStateAtom(arg.launchTarget), {
            ...currentSnapshot,
            sessions: patchSession(currentSnapshot.sessions, session.sessionId, current => ({
              ...current,
              selectedModeId: applied.selectedModeId ?? current.selectedModeId,
              selectedModelId: applied.selectedModelId ?? current.selectedModelId,
              sessionConfiguration: applied.sessionConfiguration,
            })),
          });
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
              get.set(backendHarnessStateAtom(arg.launchTarget), {
                ...get(backendHarnessStateAtom(arg.launchTarget)),
                sessions: patchSession(
                  get(backendHarnessStateAtom(arg.launchTarget)).sessions,
                  session.sessionId,
                  current => ({
                    ...current,
                    selectedModeId: previousModeId,
                    selectedModelId: previousModelId,
                    sessionConfiguration: previousSessionState,
                  }),
                ),
              });
            }),
          ),
        );
      }),
    )
    .pipe(Atom.keepAlive);

  return {
    cancelPromptAtomFn,
    cancelSubagentAtomFn,
    materializeVirtualThenSendAtomFn,
    respondElicitationAtomFn,
    respondPermissionAtomFn,
    sendChatItemAtomFn,
    setConfigOptionAtomFn,
    steerChatItemAtomFn,
  };
};
