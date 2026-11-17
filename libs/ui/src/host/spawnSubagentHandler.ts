/** The Harness side of the Hub's subagent tools (`list_subagent_targets` and, in later slices, spawn / cancel / wait). */
import { ListSubagentTargetsArgs } from '@lib/hub/protocol';
import { Effect } from 'effect';

import {
  backendHarnessSnapshotAtom,
  configOptionIndexAtom,
  requireLaunchTargetUsable,
} from '../atoms/backendState.atoms.ts';

import { isUsablePhase } from './acpSessionBootstrap.ts';
import { supportsMcpHttp } from './agentCapabilities.ts';
import { agentLaunchTargetLabel, MOUNTED_AGENT_LAUNCH_TARGETS } from './agentLaunchTarget.ts';
import { configOptionIndexIsNonempty } from './configProbe.ts';
import { hubToolHandler } from './hubToolHandler.ts';
import type { SubagentTargetInput } from './subagentTargets.ts';
import { describeSubagentTargets } from './subagentTargets.ts';

/** Other launch targets the Harness could start a subagent on right now: enabled, not switching, usable, with a Config option index. */
export const listSubagentTargetsHandler = hubToolHandler(ListSubagentTargetsArgs, (_args, caller, { registry }) =>
  Effect.sync(() => {
    const targets: SubagentTargetInput[] = [];
    for (const launchTarget of MOUNTED_AGENT_LAUNCH_TARGETS) {
      const snapshot = registry.get(backendHarnessSnapshotAtom(launchTarget));
      const index = registry.get(configOptionIndexAtom(launchTarget));
      if (
        launchTarget !== caller.launchTarget &&
        requireLaunchTargetUsable(atom => registry.get(atom), launchTarget) === undefined &&
        isUsablePhase(snapshot.phase) &&
        index !== undefined &&
        configOptionIndexIsNonempty(index)
      ) {
        targets.push({
          canSpawn: supportsMcpHttp(snapshot.initializeResult),
          index,
          label: agentLaunchTargetLabel(launchTarget),
          launchTarget,
        });
      }
    }
    return { isError: false, text: describeSubagentTargets(targets) };
  }),
);
