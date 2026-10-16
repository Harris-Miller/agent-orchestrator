import type { NormalizedConfigOption, NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';

const EFFORT_OPTION_IDS = new Set(['effort', 'reasoning_effort']);

export const isEffortConfigOptionId = (id: string): boolean => EFFORT_OPTION_IDS.has(id);

const asSelect = (option: NormalizedConfigOption | undefined): NormalizedSelectConfigOption | undefined =>
  option?.type === 'select' ? option : undefined;

export type PartitionedComposerConfigOptions = {
  readonly leftovers: readonly NormalizedConfigOption[];
  readonly mode: NormalizedSelectConfigOption | undefined;
  readonly modelEffort:
    | {
        readonly effort: NormalizedSelectConfigOption;
        readonly model: NormalizedSelectConfigOption;
      }
    | undefined;
};

/** Split Config options for F chrome: Access=`mode`, Model·Effort only when both halves exist. */
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

  if (model !== undefined && effort !== undefined) {
    return { leftovers, mode, modelEffort: { effort, model } };
  }

  const fallbackLeftovers = [...leftovers];
  const orphanModel = asSelect(model);
  const orphanEffort = asSelect(effort);
  if (orphanModel !== undefined) {
    fallbackLeftovers.push(orphanModel);
  }
  if (orphanEffort !== undefined) {
    fallbackLeftovers.push(orphanEffort);
  }
  return { leftovers: fallbackLeftovers, mode, modelEffort: undefined };
};
