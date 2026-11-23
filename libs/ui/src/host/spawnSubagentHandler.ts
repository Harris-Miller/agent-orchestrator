/** The Hub adapter for the subagent tools: lists targets; spawn, wait and cancel decode args and call the Spawned subagent module. */
import { CancelSubagentArgs, ListSubagentTargetsArgs, SpawnSubagentArgs, WaitSubagentArgs } from '@lib/hub/protocol';
import { Effect } from 'effect';

import { cancelSubagent, spawnSubagent, waitSubagents } from '../atoms/spawnedSubagent/index.ts';
import { usableSubagentTarget } from '../atoms/subagentTargets.atoms.ts';

import { supportsMcpHttp } from './agentCapabilities.ts';
import { agentLaunchTargetLabel, knownLaunchTarget, MOUNTED_AGENT_LAUNCH_TARGETS } from './agentLaunchTarget.ts';
import { hubToolHandler, toolError } from './hubToolHandler.ts';
import type { SubagentTargetInput } from './subagentTargets.ts';
import { describeSubagentTargets } from './subagentTargets.ts';

/** Launch targets (the caller's own included) the Harness could start a subagent on right now. */
export const listSubagentTargetsHandler = hubToolHandler(ListSubagentTargetsArgs, (_args, _caller, { registry }) =>
  Effect.sync(() => {
    const targets: SubagentTargetInput[] = [];
    for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
      const usable = usableSubagentTarget(registry, launchTarget);
      if (usable._tag === 'Usable') {
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

export const spawnSubagentHandler = hubToolHandler(SpawnSubagentArgs, (args, caller, { registry }) => {
  const launchTarget = knownLaunchTarget(args.launchTarget);
  const result =
    launchTarget === undefined
      ? Effect.succeed(
          toolError(
            `Unknown launch target ${JSON.stringify(args.launchTarget)}. Call list_subagent_targets for the valid ones.`,
          ),
        )
      : spawnSubagent(registry, caller, {
          configOptions: args.configOptions ?? {},
          description: args.description,
          launchTarget,
          runInBackground: args.runInBackground === true,
          task: args.task,
        });
  return result.pipe(Effect.withSpan('spawnSubagent', { root: true }));
});

export const waitSubagentHandler = hubToolHandler(WaitSubagentArgs, (args, caller, { registry }) =>
  waitSubagents(registry, caller, { ids: args.ids, timeoutMs: args.timeoutMs }),
);

export const cancelSubagentHandler = hubToolHandler(CancelSubagentArgs, (args, caller, { registry }) =>
  cancelSubagent(registry, caller, args.subagentId),
);
