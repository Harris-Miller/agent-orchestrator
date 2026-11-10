/** Chat Atom fns: Prompt turn cancel, subagent cancel, permission / elicitation replies, Config change. */
import type { CreateElicitationResponseBody } from '@libs/effect-acp';
import { Effect } from 'effect';
import { Atom } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { answerElicitation, answerPermission } from '../host/harnessStateTransitions.ts';
import { canCancelSubagent, getSubagent } from '../host/subagent.ts';
import { sessionOrSubagentOf } from '../host/subagentRouting.ts';
import type { ConfigValueDiff } from '../host/sessionConfiguration.ts';
import { cancelSession, getPromptSpan } from '../host/sessionRpc.ts';
import type { ElicitationSummary } from '../host/sessionUpdateReducer.ts';

import { backendHarnessSnapshotAtom, selectedAtom } from './backendState.atoms.ts';
import { unqueueSessionDraft } from './composer.atoms.ts';
import { selectedActiveSessionAtom } from './selectedActiveSession.atoms.ts';
import { setSessionConfigOption } from './sessionConfigChange.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { cancelPromptTurn } from './promptTurn.ts';
import { setVirtualConfigOption } from './virtualSession.atoms.ts';

export type ElicitationReply =
  | { response: Extract<CreateElicitationResponseBody, { action: 'accept' }>; summary: ElicitationSummary }
  | { response: Extract<CreateElicitationResponseBody, { action: 'decline' | 'cancel' }> };

export const createChatAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  /** Prompt turn cancel (see the Prompt turn module), un-queuing the Session's Queued message first; traced under the turn's prompt span. */
  const cancelPromptAtomFn = atomRuntime
    .fn((arg: { launchTarget: AgentLaunchTarget; sessionId: string }, get: Atom.FnContext) => {
      const parent = getPromptSpan(arg.launchTarget, arg.sessionId);
      // A Queued message must not auto-send once the turn is cancelled: it goes back into the draft first.
      unqueueSessionDraft(get.registry, arg.sessionId);
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
            answerElicitation(current, arg.sessionId, pending, 'summary' in arg ? arg.summary : undefined),
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
            answerPermission(current, arg.sessionId, pending),
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
        if (sessionId === undefined) {
          return;
        }
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.launchTarget,
          'acp.sessionId': sessionId,
        });
        const change: ConfigValueDiff =
          arg.type === 'boolean'
            ? { configId: arg.configId, type: 'boolean', value: arg.value }
            : { configId: arg.configId, type: 'select', value: arg.value };
        yield* setSessionConfigOption(get.registry, { launchTarget: arg.launchTarget, sessionId }, change);
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
