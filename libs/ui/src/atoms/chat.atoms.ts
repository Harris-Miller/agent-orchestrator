/** Chat Atom fns: Prompt turn cancel, subagent cancel, permission / elicitation replies, Session Config. */
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
import { canCancelSubagent, getSubagent } from '../host/subagent.ts';
import { patchSessionOrSubagent, sessionOrSubagentOf } from '../host/subagentRouting.ts';
import { cancelSession, getPromptSpan, setConfigOption } from '../host/sessionRpc.ts';
import { patchSession } from '../host/sessionSnapshot.ts';
import { appendElicitationSummary } from '../host/sessionUpdateReducer.ts';
import type { ElicitationSummary } from '../host/sessionUpdateReducer.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { selectedActiveSessionAtom } from './selectedActiveSession.atoms.ts';
import { withSessionClientRequest } from './sessionPatch.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { cancelPromptTurn } from './promptTurn.ts';
import { setVirtualConfigOption } from './virtualSession.atoms.ts';

export type ElicitationReply =
  | { response: Extract<CreateElicitationResponseBody, { action: 'accept' }>; summary: ElicitationSummary }
  | { response: Extract<CreateElicitationResponseBody, { action: 'decline' | 'cancel' }> };

export const createChatAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  /** Prompt turn cancel (see the Prompt turn module), traced under the turn's prompt span. */
  const cancelPromptAtomFn = atomRuntime
    .fn((arg: { launchTarget: AgentLaunchTarget; sessionId: string }, get: Atom.FnContext) => {
      const parent = getPromptSpan(arg.launchTarget, arg.sessionId);
      return cancelPromptTurn(get.registry, arg).pipe(
        Effect.withSpan('cancelPromptAtomFn', parent !== undefined ? { parent } : { root: true }),
      );
    })
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

        yield* withSessionClientRequest(arg.launchTarget, get, session.sessionId, rpc).pipe(
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
