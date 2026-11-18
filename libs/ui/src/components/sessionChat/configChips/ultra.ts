import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import { providerCapabilities } from './providerCapabilities.ts';

export const ULTRACODE_OPTION_ID = 'ultracode';
const ULTRACODE_LABEL = 'Ultracode';

/**
 * The always-first Options row for Claude Ultracode (a boolean `ultracode` option). Codex "Ultra" is not this: it is a
 * plain `ultra` choice in the Reasoning list.
 */
export type UltraRow = {
  readonly label: string;
  readonly on: boolean;
  /** Why the row is disabled; undefined when it can be toggled. */
  readonly disabledReason: string | undefined;
};

const isUltracodeOption = (option: NormalizedConfigOption) =>
  option.id === ULTRACODE_OPTION_ID && option.type === 'boolean';

/** Options for the generic rows: the boolean `ultracode` option lives on the Ultracode row. */
export const withoutUltraOption = (options: readonly NormalizedConfigOption[]) =>
  options.filter(option => !isUltracodeOption(option));

/** `undefined` when the provider has no Ultracode concept at all (nothing to show). */
export const ultraRow = (
  launchTarget: AgentLaunchTarget | undefined,
  options: readonly NormalizedConfigOption[],
): UltraRow | undefined => {
  const ultracode = options.find(isUltracodeOption);
  if (ultracode !== undefined) {
    return { disabledReason: undefined, label: ULTRACODE_LABEL, on: ultracode.currentValue === true };
  }
  const reason = providerCapabilities(launchTarget)?.ultracodeUnavailableReason;
  return reason === undefined ? undefined : { disabledReason: reason, label: ULTRACODE_LABEL, on: false };
};

/** Chip suffix part: "Ultracode" when the option is on. */
export const ultraSuffixParts = (
  launchTarget: AgentLaunchTarget | undefined,
  options: readonly NormalizedConfigOption[],
): readonly string[] => (ultraRow(launchTarget, options)?.on === true ? [ULTRACODE_LABEL] : []);

/** Diffs for flipping the Ultracode option. */
export const ultraToggleDiffs = (
  options: readonly NormalizedConfigOption[],
  on: boolean,
): readonly ConfigValueDiff[] => {
  const ultracode = options.find(isUltracodeOption);
  return ultracode === undefined ? [] : [{ configId: ultracode.id, type: 'boolean', value: on }];
};
