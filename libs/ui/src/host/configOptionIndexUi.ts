/** Shared Config option index → picker options / values (Handoff + Virtual session). */
import type { NormalizedConfigOption } from './acpSessionBootstrap.ts';
import { configValuesFromOptions, preserveConfigValuesOnModelChange } from './configProbe.ts';
import type { ConfigOptionIndex, ConfigOptionValues } from './configProbe.ts';

export const optionsWithValues = (
  options: readonly NormalizedConfigOption[],
  values: ConfigOptionValues,
): readonly NormalizedConfigOption[] =>
  options.map(option => {
    if (!Object.hasOwn(values, option.id)) {
      return option;
    }
    const value = values[option.id];
    if (option.type === 'boolean' && typeof value === 'boolean') {
      return { ...option, currentValue: value };
    }
    if (option.type === 'select' && typeof value === 'string') {
      return { ...option, currentValue: value };
    }
    return option;
  });

/** Models advertised by the default row's `model` select (rows for other models hydrate lazily). */
const advertisedModelIds = (index: ConfigOptionIndex): readonly string[] => {
  const modelOption = index.byModel[index.defaultModelId]?.find(option => option.id === 'model');
  return modelOption?.type === 'select' ? modelOption.choices.map(choice => choice.id) : [];
};

const isKnownModel = (index: ConfigOptionIndex, modelId: string): boolean =>
  modelId in index.byModel || advertisedModelIds(index).includes(modelId);

/** Row for a model; an advertised model with no hydrated row yet degrades to the model select alone. */
export const rowForModel = (
  index: ConfigOptionIndex | undefined,
  modelId: string | undefined,
): readonly NormalizedConfigOption[] => {
  if (index === undefined || modelId === undefined) {
    return [];
  }
  if (modelId in index.byModel) {
    return index.byModel[modelId];
  }
  const modelOption = index.byModel[index.defaultModelId]?.find(option => option.id === 'model');
  return modelOption?.type === 'select' && advertisedModelIds(index).includes(modelId)
    ? [{ ...modelOption, currentValue: modelId }]
    : [];
};

export const hardResetForAgent = (
  index: ConfigOptionIndex | undefined,
): {
  readonly options: readonly NormalizedConfigOption[];
  readonly values: ConfigOptionValues;
} => {
  if (index === undefined) {
    return { options: [], values: {} };
  }
  const options = rowForModel(index, index.defaultModelId);
  return { options, values: configValuesFromOptions(options) };
};

/** Prefer stored values when still valid against index; unavailable/missing model → defaultModelId. */
export const sanitizeConfigValuesForIndex = (
  index: ConfigOptionIndex | undefined,
  values: ConfigOptionValues,
): ConfigOptionValues => {
  if (index === undefined) {
    return values;
  }
  const modelId = typeof values.model === 'string' ? values.model : index.defaultModelId;
  const modelOk = isKnownModel(index, modelId) && !index.unavailableModelIds.includes(modelId);
  const effectiveModel = modelOk ? modelId : index.defaultModelId;
  if (!(effectiveModel in index.byModel)) {
    return { ...values, model: effectiveModel };
  }
  return preserveConfigValuesOnModelChange({ ...values, model: effectiveModel }, index.byModel[effectiveModel]);
};

export const resetUnsupportedConfigValues = (
  index: ConfigOptionIndex | undefined,
  values: ConfigOptionValues,
): ConfigOptionValues => {
  if (index === undefined) return values;
  const modelId = values.model;
  if (typeof modelId !== 'string' || !isKnownModel(index, modelId) || index.unavailableModelIds.includes(modelId)) {
    return hardResetForAgent(index).values;
  }
  if (!(modelId in index.byModel)) {
    return values;
  }
  const next: Record<string, boolean | string> = { model: modelId };
  for (const option of index.byModel[modelId]) {
    const value = values[option.id];
    if (option.type === 'select') {
      next[option.id] =
        typeof value === 'string' && option.choices.some(choice => choice.id === value)
          ? value
          : (option.currentValue ?? '');
    } else {
      next[option.id] = typeof value === 'boolean' ? value : (option.currentValue ?? false);
    }
  }
  return next;
};
