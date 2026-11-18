import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

/** How the Options section renders one Config option. */
export type OptionControlKind =
  /** Claude `agent`: compact dropdown of subagent types. */
  | 'agent-select'
  /** Boolean toggle row (Claude `fast`, Codex `fast-mode`, or any boolean option). */
  | 'toggle'
  /** Codex `collaboration_mode`: "Plan" toggle, on = `plan`, off = `default`. */
  | 'plan-toggle'
  /** Generic select option. */
  | 'select';

const FAST_OPTION_IDS: Readonly<Partial<Record<AgentLaunchTarget, string>>> = {
  'claude-agent-acp': 'fast',
  'codex-acp': 'fast-mode',
};

export const isFastOption = (launchTarget: AgentLaunchTarget | undefined, optionId: string): boolean =>
  launchTarget !== undefined && FAST_OPTION_IDS[launchTarget] === optionId;

/** Well-known Config options get a bespoke control; others get the generic control for their `type`. */
export const optionControlKind = (
  launchTarget: AgentLaunchTarget | undefined,
  option: NormalizedConfigOption,
): OptionControlKind => {
  if (launchTarget === 'claude-agent-acp' && option.id === 'agent' && option.type === 'select') {
    return 'agent-select';
  }
  if (launchTarget === 'codex-acp' && option.id === 'collaboration_mode' && option.type === 'select') {
    return 'plan-toggle';
  }
  return option.type === 'boolean' ? 'toggle' : 'select';
};

export const isWellKnownOption = (launchTarget: AgentLaunchTarget | undefined, option: NormalizedConfigOption) =>
  optionControlKind(launchTarget, option) === 'agent-select' ||
  optionControlKind(launchTarget, option) === 'plan-toggle' ||
  isFastOption(launchTarget, option.id);

export const isPlanOn = (option: NormalizedConfigOption): boolean => option.currentValue === 'plan';

export const planToggleDiff = (option: NormalizedConfigOption, on: boolean): ConfigValueDiff => ({
  configId: option.id,
  type: 'select',
  value: on ? 'plan' : 'default',
});

/** Row label: the Plan toggle is always "Plan"; everything else uses the option's own name. */
export const optionRowLabel = (launchTarget: AgentLaunchTarget | undefined, option: NormalizedConfigOption): string =>
  optionControlKind(launchTarget, option) === 'plan-toggle' ? 'Plan' : option.name;
