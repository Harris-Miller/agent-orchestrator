import type { NormalizedConfigOption, NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';

const EFFORT_OPTION_IDS = new Set(['effort', 'reasoning_effort']);

export const isEffortConfigOptionId = (id: string): boolean => EFFORT_OPTION_IDS.has(id);

export type PartitionedComposerConfigOptions = {
  readonly leftovers: readonly NormalizedConfigOption[];
  readonly mode: NormalizedSelectConfigOption | undefined;
  readonly modelEffort:
    | {
        readonly effort: NormalizedSelectConfigOption | undefined;
        readonly model: NormalizedSelectConfigOption;
      }
    | undefined;
};

/** Split Config options for composer chrome: `mode`; model slot when `model` present (effort optional). */
export const partitionComposerConfigOptions = (
  options: readonly NormalizedConfigOption[],
): PartitionedComposerConfigOptions => {
  let mode: NormalizedSelectConfigOption | undefined;
  let model: NormalizedSelectConfigOption | undefined;
  let effort: NormalizedSelectConfigOption | undefined;
  const leftovers: NormalizedConfigOption[] = [];

  for (const option of options) {
    if (option.id === 'mode' && option.type === 'select') {
      mode = option;
    } else if (option.id === 'model' && option.type === 'select') {
      model = option;
    } else if (isEffortConfigOptionId(option.id) && option.type === 'select') {
      effort = option;
    } else {
      leftovers.push(option);
    }
  }

  if (model !== undefined) {
    return { leftovers, mode, modelEffort: { effort, model } };
  }

  if (effort !== undefined) {
    leftovers.push(effort);
  }
  return { leftovers, mode, modelEffort: undefined };
};
