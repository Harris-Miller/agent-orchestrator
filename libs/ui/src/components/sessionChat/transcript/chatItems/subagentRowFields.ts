import type { SessionConfiguration } from '../../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../../host/agentLaunchTarget.ts';
import { subagentLatestActivity, subagentLaunchTarget } from '../../../../host/subagent.ts';
import type { SubagentSnapshot } from '../../../../host/subagent.ts';
import { subagentModelEffortLabel } from './subagentModelEffort.ts';
import { subagentStatus } from './subagentStateLabel.ts';
import type { SubagentStatus } from './subagentStateLabel.ts';

/** Everything a Subagent row displays, derived the same way for a live child and a Restored subagent. */
export type SubagentRowFields = {
  readonly activity: string | undefined;
  readonly launchTarget: AgentLaunchTarget;
  readonly modelEffort: string | undefined;
  readonly name: string;
  readonly status: SubagentStatus;
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
    status: subagentStatus(child),
  };
};
