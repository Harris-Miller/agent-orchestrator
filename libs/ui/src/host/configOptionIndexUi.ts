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

/** The default row's `model` select: its choices are the advertised models (other rows hydrate lazily). */
const defaultModelOption = (index: ConfigOptionIndex) =>
  index.byModel[index.defaultModelId]?.find(option => option.id === 'model');

/** Models the agent advertises (choices of the default row's `model` select); empty with no index. */
export const advertisedModelChoices = (index: ConfigOptionIndex | undefined) => {
  const modelOption = index === undefined ? undefined : defaultModelOption(index);
  return modelOption?.type === 'select' ? modelOption.choices : [];
};

/** The default row's `model` select when `modelId` is one of its choices (an advertised model). */
const advertisedModelSelect = (index: ConfigOptionIndex, modelId: string) => {
  const modelOption = defaultModelOption(index);
  return modelOption?.type === 'select' && modelOption.choices.some(choice => choice.id === modelId)
    ? modelOption
    : undefined;
};

const isHydrated = (index: ConfigOptionIndex, modelId: string): boolean => modelId in index.byModel;

const isKnownModel = (index: ConfigOptionIndex, modelId: string): boolean =>
  isHydrated(index, modelId) || advertisedModelSelect(index, modelId) !== undefined;

/** Row for a model; an advertised model with no hydrated row yet degrades to the model select alone. */
export const rowForModel = (
  index: ConfigOptionIndex | undefined,
  modelId: string | undefined,
): readonly NormalizedConfigOption[] => {
  if (index === undefined || modelId === undefined) {
    return [];
  }
  if (isHydrated(index, modelId)) {
    return index.byModel[modelId];
  }
  const modelOption = advertisedModelSelect(index, modelId);
  return modelOption === undefined ? [] : [{ ...modelOption, currentValue: modelId }];
};

/** A Virtual model pick needs a live `set_config_option` when a Bound session exists and the model's row is not hydrated yet. */
export const needsLazyHydrate = (
  index: ConfigOptionIndex | undefined,
  boundSessionId: string | undefined,
  modelId: string,
): boolean =>
  index !== undefined &&
  boundSessionId !== undefined &&
  !isHydrated(index, modelId) &&
  !index.unavailableModelIds.includes(modelId) &&
  advertisedModelSelect(index, modelId) !== undefined;

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
  if (!isHydrated(index, effectiveModel)) {
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
  if (!isHydrated(index, modelId)) {
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
