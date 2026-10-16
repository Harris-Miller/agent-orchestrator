/** Chat prompt / permission / elicitation / config Atom fns. */
import type { CreateElicitationResponseBody } from '@libs/effect-acp';
import { Effect, Exit } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import {
  applySetConfigOptionResult,
  normalizeConfigOptions,
  patchConfigOptionValue,
  selectionFromSessionConfiguration,
} from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { withUserChatMessage } from '../host/applySessionUpdate.ts';
import { materializeIntoSnapshot } from '../host/harnessStateTransitions.ts';
import { getPromptSpan } from '../host/promptSpanRegistry.ts';
import { applyConfigDiffs, buildActivatedSession, rosterEntryFromNew } from '../host/sessionMaterialize.ts';
import type { ConfigValueDiff } from '../host/sessionMaterialize.ts';
import { cancelSession, createSession, setConfigOption } from '../host/sessionRpc.ts';
import { markNonFinishedToolCallsCancelled } from '../host/sessionUpdateReducer.ts';

import {
  backendHarnessStateAtom,
  selectedAtom,
  selectedSessionIdAtom,
  virtualMaterializeInFlightAtom,
} from './backendState.atoms.ts';
import { patchSession, sendPromptSoftCancel, withSessionClientRequest } from './sessionPatch.atoms.ts';
import { lastCreateDefaultsAtom, virtualSessionAtom } from './virtualSession.atoms.ts';

export const draftAtom = Atom.family((_sessionId: string) => Atom.make('').pipe(Atom.keepAlive));

const sendChatItemEffect = Effect.fn('sendChatItemEffect')(function* (
  arg: { launchTarget: AgentLaunchTarget; text: string },
  get: Atom.FnContext,
) {
  const trimmed = arg.text.trim();
  const sessionId = get(selectedSessionIdAtom);
  const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
  const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];

  if (trimmed.length === 0 || session?.status !== 'active') {
    return;
  }

  yield* Effect.annotateCurrentSpan({
    'acp.agent': arg.launchTarget,
    'acp.sessionId': session.sessionId,
  });

  get.set(backendHarnessStateAtom(arg.launchTarget), {
    ...snapshot,
    sessions: patchSession(snapshot.sessions, session.sessionId, current => withUserChatMessage(current, trimmed)),
  });

  yield* withSessionClientRequest(
    arg.launchTarget,
    get,
    session.sessionId,
    'prompt',
    sendPromptSoftCancel(arg.launchTarget, get, session.sessionId, trimmed),
  );
});

export const createChatAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  const sendChatItemAtomFn = atomRuntime
    .fn(
      Effect.fn('sendChatItemAtomFn', { root: true })(function* (
        arg: { launchTarget: AgentLaunchTarget; text: string },
        get: Atom.FnContext,
      ) {
        yield* sendChatItemEffect(arg, get);
      }),
    )
    .pipe(Atom.keepAlive);

  /**
   * First send on Virtual: session/new → applyConfigDiffs → Materialize → draft copy →
   * clear virtual + Select Session → sendChatItem. Stay on Virtual until Materialize succeeds.
   */
  const materializeVirtualThenSendAtomFn = atomRuntime
    .fn(
      Effect.fn('materializeVirtualThenSendAtomFn', { root: true })(
        function* (_arg: undefined, get: Atom.FnContext) {
          if (get(virtualMaterializeInFlightAtom)) {
            return;
          }
          const selected = get(selectedAtom);
          const virtual = get(virtualSessionAtom);
          if (selected?._tag !== 'Virtual' || virtual === null) {
            return;
          }
          const { configValues, cwd, draft, launchTarget } = virtual;
          const trimmed = draft.trim();
          if (
            trimmed.length === 0 ||
            launchTarget === undefined ||
            cwd === undefined ||
            get(backendHarnessStateAtom(launchTarget)).phase !== 'ready'
          ) {
            return;
          }

          get.set(virtualMaterializeInFlightAtom, true);
          yield* Effect.annotateCurrentSpan({ 'acp.agent': launchTarget });
          yield* Effect.logInfo('UI materializeVirtualThenSend', launchTarget, { cwd });

          const createExit = yield* Effect.exit(createSession(launchTarget, cwd));
          if (Exit.isFailure(createExit)) {
            yield* Effect.logError('materializeVirtualThenSend session/new failed', launchTarget, createExit.cause);
            return;
          }
          const { cwd: createdCwd, result } = createExit.value;
          const { sessionId } = result;
          yield* Effect.annotateCurrentSpan('acp.sessionId', sessionId);

          const rosterEntry = rosterEntryFromNew(result, createdCwd);
          if (rosterEntry !== undefined) {
            const createdSnapshot = get(backendHarnessStateAtom(launchTarget));
            get.set(backendHarnessStateAtom(launchTarget), materializeIntoSnapshot(createdSnapshot, { rosterEntry }));
          }

          const setOption = (diff: ConfigValueDiff) =>
            setConfigOption(
              launchTarget,
              sessionId,
              diff.configId,
              diff.type === 'boolean' ? { type: 'boolean', value: diff.value } : { type: 'select', value: diff.value },
            );
          const afterOverrides = yield* applyConfigDiffs(result, configValues, setOption);
          if (afterOverrides.stoppedEarly) {
            yield* Effect.logWarning(
              'materializeVirtualThenSend applyConfigDiffs stopped early',
              launchTarget,
              sessionId,
            );
          }

          const configuredSnapshot = get(backendHarnessStateAtom(launchTarget));
          get.set(
            backendHarnessStateAtom(launchTarget),
            materializeIntoSnapshot(configuredSnapshot, {
              session: buildActivatedSession(sessionId, afterOverrides.sessionConfiguration, { cwd: createdCwd }),
            }),
          );

          get.set(lastCreateDefaultsAtom, { configValues, launchTarget });
          get.set(draftAtom(sessionId), draft);
          get.set(virtualSessionAtom, null);
          // Bypass in-flight guard: we still hold the lock until ensuring clears it.
          get.set(selectedAtom, { _tag: 'Session', sessionId });

          yield* sendChatItemEffect({ launchTarget, text: draft }, get);
        },
        (effect, _arg, get: Atom.FnContext) =>
          effect.pipe(
            Effect.tapError(error => Effect.logError('materializeVirtualThenSendAtomFn failed', error)),
            Effect.ensuring(
              Effect.sync(() => {
                get.set(virtualMaterializeInFlightAtom, false);
              }),
            ),
          ),
      ),
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
        const sessionId = get(selectedSessionIdAtom);
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
    materializeVirtualThenSendAtomFn,
    respondElicitationAtomFn,
    respondPermissionAtomFn,
    sendChatItemAtomFn,
    setConfigOptionAtomFn,
  };
};
