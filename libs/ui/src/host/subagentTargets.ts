/**
 * What `list_subagent_targets` tells an agent: per usable launch target, its models and each model's selectable
 * Config options, read from the Config option index. Pure, so the output shape and its size cap are testable alone.
 */
import type { NormalizedConfigOption } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import type { ConfigOptionIndex, ConfigOptionValues } from './configProbe.ts';

/** A full index can be large; the listing is truncated beyond this many characters. */
export const MAX_TARGETS_LISTING_CHARS = 16_000;

export type SubagentTargetInput = {
  /** Whether the target's agent accepts the Hub, i.e. the child may use Hub tools itself. */
  readonly canSpawn: boolean;
  readonly index: ConfigOptionIndex;
  readonly label: string;
  readonly launchTarget: AgentLaunchTarget;
};

const describeOption = (option: NormalizedConfigOption) =>
  option.type === 'select'
    ? { default: option.currentValue, id: option.id, name: option.name, values: option.choices.map(c => c.id) }
    : { default: option.currentValue, id: option.id, name: option.name, values: [true, false] };

/** The models an agent may be asked for: the default row's `model` choices (else every row), minus refused ones. */
const modelChoices = (index: ConfigOptionIndex) => {
  const modelSelect = index.byModel[index.defaultModelId]?.find(option => option.id === 'model');
  const choices = modelSelect?.type === 'select' ? modelSelect.choices : [];
  const ids = choices.length > 0 ? choices.map(choice => choice.id) : Object.keys(index.byModel);
  return { choices, ids: ids.filter(id => !index.unavailableModelIds.includes(id)) };
};

const describeModels = (index: ConfigOptionIndex) => {
  const { choices, ids } = modelChoices(index);
  return ids.map(id => ({
    default: id === index.defaultModelId,
    id,
    name: choices.find(choice => choice.id === id)?.name ?? id,
    // A model whose row is not loaded yet has no listed options; its `model` value alone is still valid.
    options: (index.byModel[id] ?? []).filter(option => option.id !== 'model').map(describeOption),
  }));
};

/**
 * Why `configOptions` cannot be applied to a child on this target, naming the valid choices, or undefined when they
 * can: `model` (the default when absent) must be an advertised model, every other id and value must exist in that
 * model's row. Checked before any session is created.
 */
export const validateSubagentConfig = (
  index: ConfigOptionIndex,
  configOptions: ConfigOptionValues,
): string | undefined => {
  const { ids } = modelChoices(index);
  const model = configOptions['model'] ?? index.defaultModelId;
  if (typeof model !== 'string' || !ids.includes(model)) {
    return `Unknown model ${JSON.stringify(model)}. Valid models: ${ids.join(', ')}.`;
  }
  const others = Object.entries(configOptions).filter(([id]) => id !== 'model');
  if (others.length === 0) {
    return undefined;
  }
  const row = index.byModel[model];
  if (row === undefined) {
    return `The options of model ${JSON.stringify(model)} are not loaded yet; pass only "model" for it.`;
  }
  const valid = row.filter(option => option.id !== 'model');
  for (const [id, value] of others) {
    const option = valid.find(candidate => candidate.id === id);
    if (option === undefined) {
      return `Unknown config option ${JSON.stringify(id)} for model ${JSON.stringify(model)}. Valid options: ${valid.map(candidate => candidate.id).join(', ') || '(none)'}.`;
    }
    if (option.type === 'boolean') {
      if (typeof value !== 'boolean') {
        return `Config option ${JSON.stringify(id)} takes true or false.`;
      }
    } else if (typeof value !== 'string' || !option.choices.some(choice => choice.id === value)) {
      return `Invalid value ${JSON.stringify(value)} for config option ${JSON.stringify(id)}. Valid values: ${option.choices.map(choice => choice.id).join(', ')}.`;
    }
  }
  return undefined;
};

export const describeSubagentTargets = (targets: readonly SubagentTargetInput[]): string => {
  const text = JSON.stringify(
    {
      note: 'Pass `launchTarget` and optional `configOptions` ({ <option id>: <value> }, `model` first) to spawn_subagent.',
      targets: targets.map(target => ({
        canSpawn: target.canSpawn,
        label: target.label,
        launchTarget: target.launchTarget,
        models: describeModels(target.index),
      })),
    },
    undefined,
    1,
  );
  return text.length <= MAX_TARGETS_LISTING_CHARS
    ? text
    : `${text.slice(0, MAX_TARGETS_LISTING_CHARS)}\n… truncated. Pass only the config option ids shown above in \`configOptions\`.`;
};
