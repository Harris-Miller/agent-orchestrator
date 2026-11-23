/**
 * The agent-facing Spawned subagent verbs behind the Hub's `spawn_subagent`, `wait_subagent` and `cancel_subagent`:
 * each answers with the tool result the agent reads (a Subagent result, ADR 0013), and owns the lifecycle policy —
 * the foreground wait and its bound, promotion to a background Subagent report, and cancel when the caller's turn ends.
 */
import type { HostServices } from '@lib/context-services';
import { MAX_SUBAGENT_WAIT_MS } from '@lib/hub/protocol';
import { Deferred, Duration, Effect, Stream } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import type { AgentLaunchTarget, SessionRef } from '../../host/agentLaunchTarget.ts';
import type { ConfigOptionValues } from '../../host/configProbe.ts';
import { toolError } from '../../host/hubToolHandler.ts';
import { describeError } from '../../host/requestError.ts';
import type { HubToolResult } from '../../host/hubToolHandler.ts';
import { getPromptSpan } from '../../host/sessionRpc.ts';
import { backendHarnessSnapshotAtom } from '../backendState.atoms.ts';
import { cancelPromptTurn, sessionById } from '../promptTurn.ts';

import { SpawnSubagentError, startSpawnedSubagent } from './lifecycle.ts';
import { childrenOf } from './links.ts';
import type { SubagentOutcome } from './links.ts';
import { awaitOutcomeEntry, childRef, startReporter, subagentResultText, takeOutcomeAsToolResult } from './report.ts';
import type { ChildMeta } from './report.ts';

type Registry = AtomRegistry.AtomRegistry;

export type SpawnSubagentRequest = {
  readonly configOptions: ConfigOptionValues;
  /** The mirror's name. */
  readonly description: string;
  readonly launchTarget: AgentLaunchTarget;
  /** Answer at once and report the outcome later, instead of waiting in the foreground. */
  readonly runInBackground: boolean;
  readonly task: string;
};

/** The foreground / wait bound. */
const DEFAULT_BOUND = Duration.millis(MAX_SUBAGENT_WAIT_MS);

/** Whether the caller's turn is over: cancelled, closed, or (for a turn the Harness started) ended. */
const callerGone = (registry: Registry, caller: SessionRef, harnessStartedTurn: boolean) =>
  AtomRegistry.toStream(registry, backendHarnessSnapshotAtom(caller.launchTarget)).pipe(
    Stream.filter(({ sessions }) => {
      const session = sessionById(sessions, caller.sessionId);
      return (
        session?.status !== 'active' ||
        session.promptCancelRequested === true ||
        (harnessStartedTurn && session.pendingClientRequest !== 'prompt')
      );
    }),
    Stream.runHead,
  );

type Waited =
  | { readonly _tag: 'Bound' }
  | { readonly _tag: 'CallerGone' }
  | { readonly _tag: 'Outcome'; readonly outcome: SubagentOutcome };

/**
 * `spawn_subagent`: start a Spawned subagent session for `caller` and, unless `runInBackground`, wait for its outcome up
 * to the bound. Past the bound (or when the agent's call is interrupted) the child is promoted to a background child whose
 * outcome arrives as a Subagent report; when the caller's turn ends first, the child is cancelled.
 */
export const spawnSubagent = Effect.fnUntraced(function* (
  registry: Registry,
  caller: SessionRef,
  request: SpawnSubagentRequest,
): Effect.fn.Return<HubToolResult, never, HostServices> {
  const harnessStartedTurn =
    registry.get(backendHarnessSnapshotAtom(caller.launchTarget)).sessions[caller.sessionId]?.pendingClientRequest ===
    'prompt';
  // The child's own prompt span nests under the caller's turn.
  const parentSpan = getPromptSpan(caller.launchTarget, caller.sessionId);
  const start = startSpawnedSubagent(registry, {
    configOptions: request.configOptions,
    description: request.description,
    launchTarget: request.launchTarget,
    parent: caller,
    task: request.task,
  });
  const started = yield* (parentSpan === undefined ? start : Effect.withParentSpan(start, parentSpan)).pipe(
    Effect.catchTag('SpawnSubagentError', error => Effect.succeed(error)),
  );
  if (started instanceof SpawnSubagentError) {
    return toolError(describeError(started));
  }
  const spawned: ChildMeta = {
    childLaunchTarget: request.launchTarget,
    childSessionId: started.childSessionId,
    description: request.description,
    task: request.task.trim(),
  };
  const child = childRef(spawned);
  const running = (note: string): HubToolResult => ({
    isError: false,
    text: subagentResultText(registry, spawned, 'running', note),
  });
  if (request.runInBackground) {
    yield* startReporter(registry, child);
    return running(
      'The subagent runs in the background. Its result arrives later as a <subagent-report> message; or call wait_subagent with this id.',
    );
  }
  // The child runs in a detached fiber, so this wait may be interrupted (hub connection lost) without stopping it; the
  // call then ends, and the link keeps the outcome for `wait_subagent`.
  const waited = yield* Effect.raceAllFirst([
    Effect.map(Deferred.await(started.outcome), (outcome): Waited => ({ _tag: 'Outcome', outcome })),
    Effect.as(callerGone(registry, caller, harnessStartedTurn), { _tag: 'CallerGone' } satisfies Waited),
    Effect.as(Effect.sleep(DEFAULT_BOUND), { _tag: 'Bound' } satisfies Waited),
  ]).pipe(
    // The agent's call is gone (hub connection lost): the child's result still reaches it, as a Subagent report.
    Effect.onInterrupt(() => startReporter(registry, child)),
  );
  switch (waited._tag) {
    case 'Outcome': {
      return takeOutcomeAsToolResult(registry, spawned, waited.outcome);
    }
    case 'CallerGone': {
      yield* cancelPromptTurn(registry, child).pipe(Effect.ignore);
      yield* Deferred.await(started.outcome).pipe(Effect.timeoutOption(DEFAULT_BOUND));
      return toolError('The subagent was cancelled because your turn ended.');
    }
    case 'Bound': {
      // Promote to a background child: if the agent never calls `wait_subagent`, the result arrives as a Subagent
      // report (a `wait_subagent` that collects it first suppresses the report).
      yield* startReporter(registry, child);
      return running('The subagent is still running. Call wait_subagent with this id to get its result.');
    }
  }
});

/** `wait_subagent`: each of `caller`'s named children's outcome, or a running Subagent result past the bound. */
export const waitSubagents = Effect.fnUntraced(function* (
  registry: Registry,
  caller: SessionRef,
  request: { readonly ids: readonly string[]; readonly timeoutMs: number | undefined },
) {
  const links = childrenOf(registry, caller);
  const children = request.ids.map(id => links.find(link => link.childSessionId === id));
  const unknown = request.ids.filter((_id, index) => children[index] === undefined);
  if (unknown.length > 0) {
    return toolError(`You have no subagent with id ${unknown.map(id => JSON.stringify(id)).join(', ')}.`);
  }
  const bound = Duration.min(Duration.millis(request.timeoutMs ?? MAX_SUBAGENT_WAIT_MS), DEFAULT_BOUND);
  const lines = yield* Effect.forEach(
    children,
    link => (link === undefined ? Effect.succeed('') : awaitOutcomeEntry(registry, link, bound)),
    { concurrency: 'unbounded' },
  );
  return { isError: false, text: lines.join('\n') } satisfies HubToolResult;
});

/** `cancel_subagent`: Prompt turn cancel of one of `caller`'s running children. */
export const cancelSubagent = Effect.fnUntraced(function* (registry: Registry, caller: SessionRef, subagentId: string) {
  const link = childrenOf(registry, caller).find(candidate => candidate.childSessionId === subagentId);
  if (link === undefined) {
    return toolError(`You have no subagent with id ${JSON.stringify(subagentId)}.`);
  }
  if (Deferred.isDoneUnsafe(link.outcome)) {
    return { isError: false, text: 'The subagent has already finished.' } satisfies HubToolResult;
  }
  yield* cancelPromptTurn(registry, childRef(link)).pipe(Effect.ignore);
  return { isError: false, text: 'Cancel requested; the subagent stops shortly.' } satisfies HubToolResult;
});
