/** The Harness side of the Hub's subagent tools (`list_subagent_targets` and, in later slices, spawn / cancel / wait). */
import { ListSubagentTargetsArgs } from '@lib/hub/protocol';
import { Effect } from 'effect';

import { usableSubagentTarget } from '../atoms/subagentTargets.atoms.ts';

import { supportsMcpHttp } from './agentCapabilities.ts';
import { agentLaunchTargetLabel, MOUNTED_AGENT_LAUNCH_TARGETS } from './agentLaunchTarget.ts';
import { hubToolHandler } from './hubToolHandler.ts';
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
