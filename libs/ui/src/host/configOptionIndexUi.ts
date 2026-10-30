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

export const rowForModel = (
  index: ConfigOptionIndex | undefined,
  modelId: string | undefined,
): readonly NormalizedConfigOption[] => {
  if (index === undefined || modelId === undefined) {
    return [];
  }
  return index.byModel[modelId] ?? [];
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
  const modelOk = modelId in index.byModel && !index.unavailableModelIds.includes(modelId);
  const effectiveModel = modelOk ? modelId : index.defaultModelId;
  const row = rowForModel(index, effectiveModel);
  return preserveConfigValuesOnModelChange({ ...values, model: effectiveModel }, row);
};

export const reconcileConfigValues = (
  index: ConfigOptionIndex | undefined,
  values: ConfigOptionValues,
): ConfigOptionValues => {
  if (index === undefined) return values;
  const modelId = values.model;
  if (typeof modelId !== 'string' || !(modelId in index.byModel) || index.unavailableModelIds.includes(modelId)) {
    return hardResetForAgent(index).values;
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
