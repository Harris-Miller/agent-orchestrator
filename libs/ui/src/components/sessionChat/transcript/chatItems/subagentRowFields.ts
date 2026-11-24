import type { SessionConfiguration } from '../../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../../host/agentLaunchTarget.ts';
import { subagentLatestActivity, subagentLaunchTarget } from '../../../../host/subagent.ts';
import type { SubagentSnapshot } from '../../../../host/subagent.ts';
import { subagentModelEffortLabel } from './subagentModelEffort.ts';

/** Everything a Subagent row displays, derived the same way for a live child and a Restored subagent. */
export type SubagentRowFields = {
  readonly activity: string | undefined;
  readonly launchTarget: AgentLaunchTarget;
  readonly modelEffort: string | undefined;
  readonly name: string;
};

export const subagentRowFields = (
  child: SubagentSnapshot,
  parentLaunchTarget: AgentLaunchTarget,
  configuration: SessionConfiguration | undefined,
): SubagentRowFields => {
  const launchTarget = subagentLaunchTarget(child, parentLaunchTarget);
  return {
    activity: subagentLatestActivity(child),
    launchTarget,
    modelEffort: configuration === undefined ? undefined : subagentModelEffortLabel(launchTarget, configuration),
    name: child.name ?? 'Subagent',
  };
};
