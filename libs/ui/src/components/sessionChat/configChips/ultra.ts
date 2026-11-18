import type { NormalizedConfigOption, NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import { isEffortConfigOptionId } from './partitionComposerConfigOptions.ts';
import { providerCapabilities } from './providerCapabilities.ts';

export const ULTRA_EFFORT_ID = 'ultra';
export const ULTRACODE_OPTION_ID = 'ultracode';

/** The always-first Options row: Codex Ultra (an `ultra` effort choice) or Claude Ultracode (a boolean `ultracode` option). */
export type UltraRow = {
  readonly kind: 'effort' | 'option';
  readonly label: string;
  readonly on: boolean;
  /** Why the row is disabled; undefined when it can be toggled. */
  readonly disabledReason: string | undefined;
};

const isEffortSelect = (option: NormalizedConfigOption): option is NormalizedSelectConfigOption =>
  isEffortConfigOptionId(option.id) && option.type === 'select';

export const ultraLabel = (launchTarget: AgentLaunchTarget | undefined): string =>
  providerCapabilities(launchTarget)?.ultraLabel ?? 'Ultra';

const isUltracodeOption = (option: NormalizedConfigOption) =>
  option.id === ULTRACODE_OPTION_ID && option.type === 'boolean';

/** Options for the generic rows: the boolean `ultracode` option lives on the Ultra row. */
export const withoutUltraOption = (options: readonly NormalizedConfigOption[]) =>
  options.filter(option => !isUltracodeOption(option));

/** `undefined` when the provider has no Ultra concept at all (nothing to show). */
export const ultraRow = (
  launchTarget: AgentLaunchTarget | undefined,
  options: readonly NormalizedConfigOption[],
): UltraRow | undefined => {
  const label = ultraLabel(launchTarget);
  const ultracode = options.find(isUltracodeOption);
  if (ultracode !== undefined) {
    return { disabledReason: undefined, kind: 'option', label, on: ultracode.currentValue === true };
  }
  const effort = options.find(isEffortSelect);
  const supported = effort?.choices.some(choice => choice.id === ULTRA_EFFORT_ID) === true;
  if (supported) {
    return { disabledReason: undefined, kind: 'effort', label, on: effort.currentValue === ULTRA_EFFORT_ID };
  }
  const capabilities = providerCapabilities(launchTarget);
  if (capabilities === undefined) {
    return undefined;
  }
  return {
    disabledReason: capabilities.ultraUnavailableReason,
    kind: 'effort',
    label,
    on: false,
  };
};

/** Chip suffix part: the Ultra label when Ultra is on (by effort or by the boolean option). */
export const ultraSuffixParts = (
  launchTarget: AgentLaunchTarget | undefined,
  options: readonly NormalizedConfigOption[],
): readonly string[] => (ultraRow(launchTarget, options)?.on === true ? [ultraLabel(launchTarget)] : []);

/** Effort choices shown under "Reasoning": `ultra` lives on the Ultra row. */
export const reasoningChoices = (effort: NormalizedSelectConfigOption) =>
  effort.choices.filter(choice => choice.id !== ULTRA_EFFORT_ID);

const PREFERRED_FALLBACK_EFFORTS = ['medium', 'high'];

/** Effort to return to when Ultra goes off: the remembered one if still offered, else a middling default. */
const restoreEffort = (effort: NormalizedSelectConfigOption, previousEffort: string | undefined) => {
  const choices = reasoningChoices(effort);
  const remembered = choices.find(choice => choice.id === previousEffort);
  if (remembered !== undefined) {
    return remembered.id;
  }
  const preferred = PREFERRED_FALLBACK_EFFORTS.flatMap(id => choices.filter(choice => choice.id === id)).at(0);
  return (preferred ?? choices.at(Math.floor(choices.length / 2)))?.id;
};

/**
 * Diffs for flipping the Ultra row. Effort-based Ultra restores `previousEffort` on off (else a default: `medium`/`high`, else the middle choice).
 */
export const ultraToggleDiffs = (
  options: readonly NormalizedConfigOption[],
  on: boolean,
  previousEffort: string | undefined,
): readonly ConfigValueDiff[] => {
  const ultracode = options.find(isUltracodeOption);
  if (ultracode !== undefined) {
    return [{ configId: ultracode.id, type: 'boolean', value: on }];
  }
  const effort = options.find(isEffortSelect);
  if (effort === undefined) {
    return [];
  }
  const value = on ? ULTRA_EFFORT_ID : restoreEffort(effort, previousEffort);
  return value === undefined ? [] : [{ configId: effort.id, type: 'select', value }];
};
