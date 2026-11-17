/** The Harness side of the Hub's subagent tools: list targets, spawn, wait (cancel follows). */
import { ListSubagentTargetsArgs, MAX_SUBAGENT_WAIT_MS, SpawnSubagentArgs, WaitSubagentArgs } from '@lib/hub/protocol';
import { Deferred, Duration, Effect, Stream } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { backendHarnessSnapshotAtom } from '../atoms/backendState.atoms.ts';
import { cancelPromptTurn } from '../atoms/promptTurn.ts';
import { SpawnSubagentError, startSpawnedSubagent } from '../atoms/spawnedSubagent.ts';
import { spawnedLinksAtom } from '../atoms/subagentLinks.atoms.ts';
import { usableSubagentTarget } from '../atoms/subagentTargets.atoms.ts';

import { supportsMcpHttp } from './agentCapabilities.ts';
import { agentLaunchTargetLabel, ALL_AGENT_LAUNCH_TARGETS, MOUNTED_AGENT_LAUNCH_TARGETS } from './agentLaunchTarget.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { hubToolHandler, toolError } from './hubToolHandler.ts';
import type { HubToolCaller, HubToolResult } from './hubToolHandler.ts';
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

/** One child's outcome as text for the agent: its final message, or why it has none. */
const outcomeResult = (outcome: SubagentOutcome): HubToolResult => {
  if (outcome.status === 'completed') {
    return outcome.text.trim() === ''
      ? toolError('The subagent finished without producing a final message.')
      : { isError: false, text: outcome.text };
  }
  return toolError(
    outcome.status === 'cancelled' ? 'The subagent was cancelled.' : `The subagent failed: ${outcome.text}`,
  );
};

/** Whether the caller's turn is over: cancelled, closed, or (for a turn the Harness started) ended. */
const callerGone = (registry: AtomRegistry.AtomRegistry, caller: HubToolCaller, harnessStartedTurn: boolean) =>
  AtomRegistry.toStream(registry, backendHarnessSnapshotAtom(caller.launchTarget)).pipe(
    Stream.filter(({ sessions }) => {
      if (!(caller.sessionId in sessions)) {
        return true;
      }
      const session = sessions[caller.sessionId];
      return (
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
    // The child runs in a detached fiber (the spawn core), so this wait may be interrupted (hub connection lost) without
    // stopping it; the call then ends, and the link keeps the outcome for `wait_subagent`.
    const waited = yield* Effect.raceAllFirst([
      Effect.map(Deferred.await(started.outcome), (outcome): Waited => ({ _tag: 'Outcome', outcome })),
      Effect.as(callerGone(registry, caller, harnessStartedTurn), { _tag: 'CallerGone' } satisfies Waited),
      Effect.as(Effect.sleep(ctx.foregroundBound ?? DEFAULT_BOUND), { _tag: 'Bound' } satisfies Waited),
    ]);
    switch (waited._tag) {
      case 'Outcome': {
        return outcomeResult(waited.outcome);
      }
      case 'CallerGone': {
        yield* cancelPromptTurn(registry, child).pipe(Effect.ignore);
        yield* Deferred.await(started.outcome).pipe(Effect.timeoutOption(ctx.foregroundBound ?? DEFAULT_BOUND));
        return toolError('The subagent was cancelled because your turn ended.');
      }
      case 'Bound': {
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
    const bound = Duration.min(
      Duration.millis(args.timeoutMs ?? MAX_SUBAGENT_WAIT_MS),
      ctx.foregroundBound === undefined ? DEFAULT_BOUND : Duration.fromInputUnsafe(ctx.foregroundBound),
    );
    const lines = yield* Effect.forEach(
      children,
      link =>
        link === undefined
          ? Effect.succeed('')
          : Deferred.await(link.outcome).pipe(
              Effect.timeoutOption(bound),
              Effect.map(outcome =>
                outcome._tag === 'None'
                  ? `<subagent id="${link.childSessionId}" status="running" />`
                  : `<subagent id="${link.childSessionId}" status="${outcome.value.status}">\n${outcome.value.text}\n</subagent>`,
              ),
            ),
      { concurrency: 'unbounded' },
    );
    return { isError: false, text: lines.join('\n') };
  }),
);
