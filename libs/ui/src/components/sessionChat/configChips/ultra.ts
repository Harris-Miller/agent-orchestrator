import type { NormalizedConfigOption, NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import { isEffortConfigOptionId } from './partitionComposerConfigOptions.ts';

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
  launchTarget === 'claude-agent-acp' ? 'Ultracode' : 'Ultra';

/** `undefined` when the provider has no Ultra concept at all (nothing to show). */
export const ultraRow = (
  launchTarget: AgentLaunchTarget | undefined,
  options: readonly NormalizedConfigOption[],
): UltraRow | undefined => {
  const label = ultraLabel(launchTarget);
  const ultracode = options.find(option => option.id === ULTRACODE_OPTION_ID && option.type === 'boolean');
  if (ultracode !== undefined) {
    return { disabledReason: undefined, kind: 'option', label, on: ultracode.currentValue === true };
  }
  const effort = options.find(isEffortSelect);
  const supported = effort?.choices.some(choice => choice.id === ULTRA_EFFORT_ID) === true;
  if (supported) {
    return { disabledReason: undefined, kind: 'effort', label, on: effort.currentValue === ULTRA_EFFORT_ID };
  }
  if (launchTarget !== 'claude-agent-acp' && launchTarget !== 'codex-acp') {
    return undefined;
  }
  return {
    disabledReason:
      launchTarget === 'claude-agent-acp' ? 'Not advertised by this provider' : 'Not supported by this model',
    kind: 'effort',
    label,
    on: false,
  };
};

/** Effort choices shown under "Reasoning": `ultra` lives on the Ultra row. */
export const reasoningChoices = (effort: NormalizedSelectConfigOption) =>
  effort.choices.filter(choice => choice.id !== ULTRA_EFFORT_ID);

/**
 * Diffs for flipping the Ultra row. Effort-based Ultra restores `previousEffort` on off (else the first Reasoning choice).
 */
export const ultraToggleDiffs = (
  options: readonly NormalizedConfigOption[],
  on: boolean,
  previousEffort: string | undefined,
): readonly ConfigValueDiff[] => {
  const ultracode = options.find(option => option.id === ULTRACODE_OPTION_ID && option.type === 'boolean');
  if (ultracode !== undefined) {
    return [{ configId: ultracode.id, type: 'boolean', value: on }];
  }
  const effort = options.find(isEffortSelect);
  if (effort === undefined) {
    return [];
  }
  const restore = reasoningChoices(effort);
  const value = on
    ? ULTRA_EFFORT_ID
    : (restore.find(choice => choice.id === previousEffort)?.id ?? restore.at(0)?.id ?? previousEffort);
  return value === undefined ? [] : [{ configId: effort.id, type: 'select', value }];
};
