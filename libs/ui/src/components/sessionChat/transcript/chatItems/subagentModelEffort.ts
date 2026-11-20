import type { SessionConfiguration } from '../../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../../host/agentLaunchTarget.ts';
import { chipSuffixParts } from '../../configChips/modelPickerList.ts';
import { partitionComposerConfigOptions } from '../../configChips/partitionComposerConfigOptions.ts';
import { configOptionChoiceLabel } from '../../configChips/sessionConfigOptionSelectViews.ts';

/** The composer chip's text for a child's Config ("Model · Effort"); undefined when it has no model option. */
export const subagentModelEffortLabel = (
  launchTarget: AgentLaunchTarget,
  configuration: SessionConfiguration,
): string | undefined => {
  const { modelEffort } = partitionComposerConfigOptions(configuration);
  if (modelEffort === undefined) return undefined;
  const suffix = chipSuffixParts(launchTarget, modelEffort.options, modelEffort.effort);
  return [configOptionChoiceLabel(modelEffort.model), ...suffix].join(' · ');
};
