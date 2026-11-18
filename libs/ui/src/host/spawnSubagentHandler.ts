/** The Harness side of the Hub's subagent tools: list targets, spawn, wait (cancel follows). */
import {
  CancelSubagentArgs,
  ListSubagentTargetsArgs,
  MAX_SUBAGENT_WAIT_MS,
  SpawnSubagentArgs,
  WaitSubagentArgs,
} from '@lib/hub/protocol';
import { Deferred, Duration, Effect, Stream } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { backendHarnessSnapshotAtom } from '../atoms/backendState.atoms.ts';
import { cancelPromptTurn, sessionById } from '../atoms/promptTurn.ts';
import { SpawnSubagentError, startSpawnedSubagent } from '../atoms/spawnedSubagent.ts';
import { spawnedLinksAtom } from '../atoms/subagentLinks.atoms.ts';
import { awaitOutcomeEntry, startReporter, takeOutcomeAsToolResult } from '../atoms/subagentOutcome.ts';
import { usableSubagentTarget } from '../atoms/subagentTargets.atoms.ts';

import { supportsMcpHttp } from './agentCapabilities.ts';
import { agentLaunchTargetLabel, ALL_AGENT_LAUNCH_TARGETS, MOUNTED_AGENT_LAUNCH_TARGETS } from './agentLaunchTarget.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { hubToolHandler, toolError } from './hubToolHandler.ts';
import type { HubToolCaller } from './hubToolHandler.ts';
import { getPromptSpan } from './sessionRpc.ts';
import { linksOfParent } from './subagentLinks.ts';
import type { SubagentOutcome } from './subagentLinks.ts';
import type { SubagentTargetInput } from './subagentTargets.ts';
import { describeSubagentTargets } from './subagentTargets.ts';

/** Other launch targets the Harness could start a subagent on right now. */
export const listSubagentTargetsHandler = hubToolHandler(ListSubagentTargetsArgs, (_args, caller, { registry }) =>
  Effect.sync(() => {
    const targets: SubagentTargetInput[] = [];
    for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
      const usable = usableSubagentTarget(registry, launchTarget);
      if (launchTarget !== caller.launchTarget && usable._tag === 'Usable') {
        targets.push({
          canSpawn: supportsMcpHttp(usable.snapshot.initializeResult),
          index: usable.index,
          label: agentLaunchTargetLabel(launchTarget),
          launchTarget,
        });
      }
    }
    return { isError: false, text: describeSubagentTargets(targets) };
  }),
);

/** The foreground / wait bound when the context injects none. */
const DEFAULT_BOUND = Duration.millis(MAX_SUBAGENT_WAIT_MS);

const knownLaunchTarget = (value: string): AgentLaunchTarget | undefined =>
  ALL_AGENT_LAUNCH_TARGETS.find(candidate => candidate === value);

/** Whether the caller's turn is over: cancelled, closed, or (for a turn the Harness started) ended. */
const callerGone = (registry: AtomRegistry.AtomRegistry, caller: HubToolCaller, harnessStartedTurn: boolean) =>
  AtomRegistry.toStream(registry, backendHarnessSnapshotAtom(caller.launchTarget)).pipe(
    Stream.filter(({ sessions }) => {
      const session = sessionById(sessions, caller.sessionId);
      return (
        session === undefined ||
        session.status !== 'active' ||
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

export const spawnSubagentHandler = hubToolHandler(SpawnSubagentArgs, (args, caller, ctx) =>
  Effect.gen(function* () {
    const launchTarget = knownLaunchTarget(args.launchTarget);
    if (launchTarget === undefined) {
      return toolError(
        `Unknown launch target ${JSON.stringify(args.launchTarget)}. Call list_subagent_targets for the valid ones.`,
      );
    }
    const { registry } = ctx;
    const harnessStartedTurn =
      registry.get(backendHarnessSnapshotAtom(caller.launchTarget)).sessions[caller.sessionId]?.pendingClientRequest ===
      'prompt';
    // The child's own prompt span nests under the caller's turn.
    const parentSpan = getPromptSpan(caller.launchTarget, caller.sessionId);
    const start = startSpawnedSubagent(registry, {
      configOptions: args.configOptions ?? {},
      description: args.description,
      launchTarget,
      parent: caller,
      task: args.task,
    });
    const started = yield* (parentSpan === undefined ? start : Effect.withParentSpan(start, parentSpan)).pipe(
      Effect.catchTag('SpawnSubagentError', error => Effect.succeed(error)),
    );
    if (started instanceof SpawnSubagentError) {
      return toolError(started.message);
    }
    const child = { launchTarget, sessionId: started.childSessionId };
    if (args.runInBackground === true) {
      yield* startReporter(registry, child);
      return {
        isError: false,
        text: JSON.stringify({
          note: 'The subagent runs in the background. Its result arrives later as a <subagent-report> message; or call wait_subagent with this id.',
          status: 'running',
          subagentId: started.childSessionId,
        }),
      };
    }
    // The child runs in a detached fiber (the spawn core), so this wait may be interrupted (hub connection lost) without
    // stopping it; the call then ends, and the link keeps the outcome for `wait_subagent`.
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
        return takeOutcomeAsToolResult(registry, child, waited.outcome);
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
        return {
          isError: false,
          text: JSON.stringify({
            note: `The subagent is still running. Call wait_subagent with this id to get its result.`,
            status: 'running',
            subagentId: started.childSessionId,
          }),
        };
      }
    }
  }).pipe(Effect.withSpan('spawnSubagent', { root: true })),
);

export const waitSubagentHandler = hubToolHandler(WaitSubagentArgs, (args, caller, ctx) =>
  Effect.gen(function* () {
    const links = linksOfParent(ctx.registry.get(spawnedLinksAtom), caller.launchTarget, caller.sessionId);
    const children = args.ids.map(id => links.find(link => link.childSessionId === id));
    const unknown = args.ids.filter((_id, index) => children[index] === undefined);
    if (unknown.length > 0) {
      return toolError(`You have no subagent with id ${unknown.map(id => JSON.stringify(id)).join(', ')}.`);
    }
    const bound = Duration.min(Duration.millis(args.timeoutMs ?? MAX_SUBAGENT_WAIT_MS), DEFAULT_BOUND);
    const lines = yield* Effect.forEach(
      children,
      link => (link === undefined ? Effect.succeed('') : awaitOutcomeEntry(ctx.registry, link, bound)),
      { concurrency: 'unbounded' },
    );
    return { isError: false, text: lines.join('\n') };
  }),
);

export const cancelSubagentHandler = hubToolHandler(CancelSubagentArgs, (args, caller, ctx) =>
  Effect.gen(function* () {
    const link = linksOfParent(ctx.registry.get(spawnedLinksAtom), caller.launchTarget, caller.sessionId).find(
      candidate => candidate.childSessionId === args.subagentId,
    );
    if (link === undefined) {
      return toolError(`You have no subagent with id ${JSON.stringify(args.subagentId)}.`);
    }
    if (Deferred.isDoneUnsafe(link.outcome)) {
      return { isError: false, text: 'The subagent has already finished.' };
    }
    yield* cancelPromptTurn(ctx.registry, {
      launchTarget: link.childLaunchTarget,
      sessionId: link.childSessionId,
    }).pipe(Effect.ignore);
    return { isError: false, text: 'Cancel requested; the subagent stops shortly.' };
  }),
);
