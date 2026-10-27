/** Chat prompt / permission / elicitation / config Atom fns. */
import type { CreateElicitationResponseBody } from '@libs/effect-acp';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import {
  applySetConfigOptionResult,
  normalizeConfigOptions,
  patchConfigOptionValue,
  selectionFromSessionConfiguration,
} from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { withUserChatMessage } from '../host/applySessionUpdate.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';
import { rowForModel } from '../host/configOptionIndexUi.ts';
import { preserveConfigValuesOnModelChange } from '../host/configProbe.ts';
import { upsertIntoSnapshot } from '../host/harnessStateTransitions.ts';
import { getPromptSpan } from '../host/promptSpanRegistry.ts';
import { applyConfigDiffs, buildActivatedSession, rosterEntryFromNew } from '../host/sessionMaterialize.ts';
import type { ConfigValueDiff } from '../host/sessionMaterialize.ts';
import { cancelSession, setConfigOption } from '../host/sessionRpc.ts';
import { markNonFinishedToolCallsCancelled } from '../host/sessionUpdateReducer.ts';
import type { UserMessageImageRef } from '../host/sessionUpdateReducer.ts';

import {
  backendHarnessStateAtom,
  configOptionIndexAtom,
  selectedAtom,
  selectedSessionIdAtom,
  virtualLifecycleInFlightAtom,
} from './backendState.atoms.ts';
import { selectedActiveSessionAtom } from './selectedActiveSession.atoms.ts';
import { patchSession, sendPromptSoftCancel, withSessionClientRequest } from './sessionPatch.atoms.ts';
import { lastCreateDefaultsAtom, virtualSessionAtom } from './virtualSession.atoms.ts';

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
  arg: { attachments?: readonly ComposerImageAttachment[]; launchTarget: AgentLaunchTarget; text: string },
  get: Atom.FnContext,
) {
  const trimmed = arg.text.trim();
  const attachments = arg.attachments ?? [];
  const sessionId = get(selectedSessionIdAtom);
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

  yield* withSessionClientRequest(
    arg.launchTarget,
    get,
    session.sessionId,
    'prompt',
    sendPromptSoftCancel(arg.launchTarget, get, session.sessionId, trimmed, attachments),
  );
});

export const createChatAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  const sendChatItemAtomFn = atomRuntime
    .fn(
      Effect.fn('sendChatItemAtomFn', { root: true })(function* (
        arg: { attachments?: readonly ComposerImageAttachment[]; launchTarget: AgentLaunchTarget; text: string },
        get: Atom.FnContext,
      ) {
        yield* sendChatItemEffect(arg, get);
      }),
    )
    .pipe(Atom.keepAlive);

  /**
   * First send on already-Bound Virtual: apply Virtual Config → roster Materialize →
   * draft copy → clear virtual + Select Session → sendChatItem.
   * Does not Bind (sole Bind triggers: mutateVirtualThenRebind + Ready). No-op if unbound / in-flight.
   * Materialize lock ends before session/prompt.
   */
  const materializeVirtualThenSendAtomFn = atomRuntime
    .fn(
      Effect.fn('materializeVirtualThenSendAtomFn', { root: true })(function* (_arg: undefined, get: Atom.FnContext) {
        if (get(virtualLifecycleInFlightAtom)) {
          return;
        }
        const selected = get(selectedAtom);
        const virtual = get(virtualSessionAtom);
        if (selected?._tag !== 'Virtual' || virtual?.sessionId === undefined || virtual.launchTarget === undefined) {
          return;
        }
        const { attachments, cwd, draft, launchTarget, sessionId } = virtual;
        const trimmed = draft.trim();
        if (
          (trimmed.length === 0 && attachments.length === 0) ||
          cwd === undefined ||
          get(backendHarnessStateAtom(launchTarget)).phase !== 'ready'
        ) {
          return;
        }

        const materialized = yield* Effect.gen(function* () {
          get.set(virtualLifecycleInFlightAtom, true);
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

          const rosterEntry = rosterEntryFromNew({ sessionId }, liveSession.cwd ?? cwd);
          const configuredSnapshot = get(backendHarnessStateAtom(launchTarget));
          get.set(
            backendHarnessStateAtom(launchTarget),
            upsertIntoSnapshot(configuredSnapshot, {
              rosterEntry,
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
          // Bypass in-flight guard while we still hold the virtual lifecycle lock.
          get.set(selectedAtom, { _tag: 'Session', sessionId });
          return { attachments, draft, launchTarget, sessionId } as const;
        }).pipe(
          Effect.tapError(error => Effect.logError('materializeVirtualThenSendAtomFn failed', error)),
          Effect.ensuring(
            Effect.sync(() => {
              get.set(virtualLifecycleInFlightAtom, false);
            }),
          ),
        );

        if (materialized === undefined) {
          return;
        }

        yield* sendChatItemEffect(
          {
            attachments: materialized.attachments,
            launchTarget: materialized.launchTarget,
            text: materialized.draft,
          },
          get,
        );
        get.set(composerAttachmentsAtom(materialized.sessionId), []);
        get.set(draftAtom(materialized.sessionId), '');
      }),
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

  const respondElicitationAtomFn = atomRuntime
    .fn(
      Effect.fnUntraced(
        function* (
          arg: {
            launchTarget: AgentLaunchTarget;
            response: CreateElicitationResponseBody;
            sessionId: string;
          },
          get: Atom.FnContext,
        ) {
          yield* Effect.annotateCurrentSpan({
            'acp.agent': arg.launchTarget,
            'acp.sessionId': arg.sessionId,
          });
          const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
          const pending = snapshot.sessions[arg.sessionId].pendingElicitation;
          if (pending === undefined) {
            return;
          }
          pending.resolve(arg.response);
          get.set(backendHarnessStateAtom(arg.launchTarget), {
            ...snapshot,
            sessions: patchSession(snapshot.sessions, arg.sessionId, current => ({
              ...current,
              pendingElicitation: undefined,
            })),
          });
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
          const pending = snapshot.sessions[arg.sessionId].pendingPermission;
          if (pending === undefined) {
            return;
          }
          pending.resolve({ outcome: { optionId: arg.optionId, outcome: 'selected' } });
          get.set(backendHarnessStateAtom(arg.launchTarget), {
            ...snapshot,
            sessions: patchSession(snapshot.sessions, arg.sessionId, current => ({
              ...current,
              pendingPermission: undefined,
            })),
          });
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
        const selected = get(selectedAtom);
        const virtual = get(virtualSessionAtom);
        // Session arm, or Bound Virtual (do not widen selectedSessionIdAtom).
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
        const previousVirtualConfigValues = virtual?.configValues;
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

        if (selected?._tag === 'Virtual' && virtual !== null) {
          const index = get(configOptionIndexAtom(arg.launchTarget));
          const nextConfigValues =
            arg.type === 'select' && arg.configId === 'model' && index !== undefined
              ? preserveConfigValuesOnModelChange(
                  { ...virtual.configValues, model: arg.value },
                  rowForModel(index, arg.value),
                )
              : { ...virtual.configValues, [arg.configId]: arg.value };
          get.set(virtualSessionAtom, {
            ...virtual,
            configValues: nextConfigValues,
          });
        }

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
              const currentVirtual = get(virtualSessionAtom);
              if (
                selected?._tag === 'Virtual' &&
                currentVirtual !== null &&
                previousVirtualConfigValues !== undefined
              ) {
                get.set(virtualSessionAtom, {
                  ...currentVirtual,
                  configValues: previousVirtualConfigValues,
                });
              }
            }),
          ),
        );
      }),
    )
    .pipe(Atom.keepAlive);

  return {
    cancelPromptAtomFn,
    materializeVirtualThenSendAtomFn,
    respondElicitationAtomFn,
    respondPermissionAtomFn,
    sendChatItemAtomFn,
    setConfigOptionAtomFn,
  };
};
