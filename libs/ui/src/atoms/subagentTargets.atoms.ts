/** Whether a launch target can host a Spawned subagent session right now: one predicate for listing and for spawning. */
import type { BackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { isUsablePhase } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from '../host/agentLaunchTarget.ts';
import type { ConfigOptionIndex } from '../host/configProbe.ts';
import { configOptionIndexIsNonempty } from '../host/configProbe.ts';
import type { AtomRegistry } from 'effect/reactivity';

import { backendHarnessSnapshotAtom, configOptionIndexAtom, requireLaunchTargetUsable } from './backendState.atoms.ts';

export type UsableSubagentTarget =
  | { readonly _tag: 'Unusable'; readonly reason: string }
  | { readonly _tag: 'Usable'; readonly index: ConfigOptionIndex; readonly snapshot: BackendHarnessSnapshot };

/** Enabled, not switching runtimes, usable bootstrap phase and a nonempty Config option index. */
export const usableSubagentTarget = (
  registry: AtomRegistry.AtomRegistry,
  launchTarget: AgentLaunchTarget,
): UsableSubagentTarget => {
  const blocked = requireLaunchTargetUsable(atom => registry.get(atom), launchTarget);
  if (blocked !== undefined) {
    return { _tag: 'Unusable', reason: blocked.message };
  }
  const label = agentLaunchTargetLabel(launchTarget);
  const snapshot = registry.get(backendHarnessSnapshotAtom(launchTarget));
  if (!isUsablePhase(snapshot.phase)) {
    return { _tag: 'Unusable', reason: `${label} is not ready yet (${snapshot.phase})` };
  }
  const index = registry.get(configOptionIndexAtom(launchTarget));
  if (index === undefined || !configOptionIndexIsNonempty(index)) {
    return { _tag: 'Unusable', reason: `${label} has not loaded its models yet` };
  }
  return { _tag: 'Usable', index, snapshot };
};
