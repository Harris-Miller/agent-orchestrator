import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import { providerCapabilities } from './providerCapabilities.ts';

export const isFastOption = (launchTarget: AgentLaunchTarget | undefined, option: NormalizedConfigOption): boolean =>
  option.type === 'boolean' && providerCapabilities(launchTarget)?.fastOptionIds.includes(option.id) === true;

/** Codex `collaboration_mode`. */
export const isPlanOption = (launchTarget: AgentLaunchTarget | undefined, option: NormalizedConfigOption): boolean => {
  const planId = providerCapabilities(launchTarget)?.planOptionId;
  return planId !== undefined && option.id === planId && option.type === 'select';
};

/** A Plan switch while the choices are exactly default|plan; with any more it falls back to a dropdown. */
export const isPlanSwitch = (launchTarget: AgentLaunchTarget | undefined, option: NormalizedConfigOption): boolean =>
  isPlanOption(launchTarget, option) &&
  option.type === 'select' &&
  option.choices.length === 2 &&
  option.choices.some(choice => choice.id === 'default') &&
  option.choices.some(choice => choice.id === 'plan');

export const isPlanOn = (option: NormalizedConfigOption): boolean => option.currentValue === 'plan';

export const planToggleDiff = (option: NormalizedConfigOption, on: boolean): ConfigValueDiff => ({
  configId: option.id,
  type: 'select',
  value: on ? 'plan' : 'default',
});

/** Row label: the Plan switch is "Plan"; everything else uses the option's own name. */
export const optionRowLabel = (launchTarget: AgentLaunchTarget | undefined, option: NormalizedConfigOption): string =>
  isPlanSwitch(launchTarget, option) ? 'Plan' : option.name;

/** Chip suffix parts for the Fast and Plan toggles when on. */
export const toggleSuffixParts = (
  launchTarget: AgentLaunchTarget | undefined,
  options: readonly NormalizedConfigOption[],
): readonly string[] => [
  ...(options.some(option => isFastOption(launchTarget, option) && option.currentValue === true) ? ['Fast'] : []),
  ...(options.some(option => isPlanOption(launchTarget, option) && isPlanOn(option)) ? ['Plan'] : []),
];

export const NOT_AVAILABLE_FOR_MODEL = 'Not available for this model';

/** An always-shown well-known option the session did not report: a disabled, off placeholder row. */
export type AbsentOptionRow = { readonly kind: 'absent'; readonly label: string };
export type OptionRowModel = AbsentOptionRow | { readonly kind: 'option'; readonly option: NormalizedConfigOption };

/**
 * Rows of the Options section after Ultracode: the provider's always-shown options first (Plan, Fast), each a real
 * row when the session reports it and a disabled placeholder when it doesn't, then every other option as reported.
 */
export const optionRowsFor = (
  launchTarget: AgentLaunchTarget | undefined,
  options: readonly NormalizedConfigOption[],
): readonly OptionRowModel[] => {
  const capabilities = providerCapabilities(launchTarget);
  const plan = options.find(option => isPlanOption(launchTarget, option));
  const fast = options.find(option => isFastOption(launchTarget, option));
  const rest = options.filter(option => option !== plan && option !== fast);
  const row = (option: NormalizedConfigOption | undefined, label: string): readonly OptionRowModel[] =>
    option === undefined ? [{ kind: 'absent', label }] : [{ kind: 'option', option }];
  return [
    ...(capabilities?.planOptionId === undefined ? [] : row(plan, 'Plan')),
    ...(capabilities === undefined ? [] : row(fast, 'Fast mode')),
    ...rest.map((option): OptionRowModel => ({ kind: 'option', option })),
  ];
};
