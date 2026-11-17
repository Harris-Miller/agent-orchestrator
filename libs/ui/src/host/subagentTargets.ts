/**
 * What `list_subagent_targets` tells an agent: per usable launch target, its models and each model's selectable
 * Config options, read from the Config option index. Pure, so the output shape and its size cap are testable alone.
 */
import type { NormalizedConfigOption } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import type { ConfigOptionIndex } from './configProbe.ts';

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

const describeModels = (index: ConfigOptionIndex) => {
  const modelSelect = index.byModel[index.defaultModelId]?.find(option => option.id === 'model');
  const choices = modelSelect?.type === 'select' ? modelSelect.choices : [];
  const ids = choices.length > 0 ? choices.map(choice => choice.id) : Object.keys(index.byModel);
  return ids
    .filter(id => !index.unavailableModelIds.includes(id))
    .map(id => ({
      default: id === index.defaultModelId,
      id,
      name: choices.find(choice => choice.id === id)?.name ?? id,
      // A model whose row is not loaded yet has no listed options; its `model` value alone is still valid.
      options: (index.byModel[id] ?? []).filter(option => option.id !== 'model').map(describeOption),
    }));
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
