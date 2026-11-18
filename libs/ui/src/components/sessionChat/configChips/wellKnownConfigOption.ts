import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import { providerCapabilities } from './providerCapabilities.ts';

export const isFastOption = (launchTarget: AgentLaunchTarget | undefined, option: NormalizedConfigOption): boolean =>
  option.type === 'boolean' && providerCapabilities(launchTarget)?.fastOptionId === option.id;

/** Codex `collaboration_mode`: rendered as a "Plan" toggle instead of a select. */
export const isPlanOption = (launchTarget: AgentLaunchTarget | undefined, option: NormalizedConfigOption): boolean => {
  const planId = providerCapabilities(launchTarget)?.planOptionId;
  return planId !== undefined && option.id === planId && option.type === 'select';
};

export const isPlanOn = (option: NormalizedConfigOption): boolean => option.currentValue === 'plan';

export const planToggleDiff = (option: NormalizedConfigOption, on: boolean): ConfigValueDiff => ({
  configId: option.id,
  type: 'select',
  value: on ? 'plan' : 'default',
});

/** Row label: the Plan toggle is always "Plan"; everything else uses the option's own name. */
export const optionRowLabel = (launchTarget: AgentLaunchTarget | undefined, option: NormalizedConfigOption): string =>
  isPlanOption(launchTarget, option) ? 'Plan' : option.name;

/** Chip suffix parts for the Fast and Plan toggles when on. */
export const toggleSuffixParts = (
  launchTarget: AgentLaunchTarget | undefined,
  options: readonly NormalizedConfigOption[],
): readonly string[] => [
  ...(options.some(option => isFastOption(launchTarget, option) && option.currentValue === true) ? ['Fast'] : []),
  ...(options.some(option => isPlanOption(launchTarget, option) && isPlanOn(option)) ? ['Plan'] : []),
];
