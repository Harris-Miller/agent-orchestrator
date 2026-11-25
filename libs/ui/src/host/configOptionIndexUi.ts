/** Shared Config option index → picker options / values (Handoff + Virtual session). */
import type { NormalizedConfigOption } from './acpSessionBootstrap.ts';
import {
  configValuesFromOptions,
  preserveConfigValuesOnModelChange,
  recommendedConfigValues,
  validRecommendedValue,
} from './configProbe.ts';
import type { ConfigOptionIndex, ConfigOptionValues } from './configProbe.ts';
import { orderedModelIds } from './modelPickerPrefs.ts';
import type { ModelPickerPrefs } from './modelPickerPrefs.ts';

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

/** Whether a Config option is the `model` select. */
export const isModelOption = (option: { readonly id: string }): boolean => option.id === 'model';

/** The default row's `model` select: its choices are the advertised models (other rows hydrate lazily). */
const defaultModelOption = (index: ConfigOptionIndex) => index.byModel[index.defaultModelId]?.find(isModelOption);

/** Models the agent advertises (choices of the default row's `model` select); empty with no index. */
export const advertisedModelChoices = (index: ConfigOptionIndex | undefined) => {
  const modelOption = index === undefined ? undefined : defaultModelOption(index);
  return modelOption?.type === 'select' ? modelOption.choices : [];
};

/** Model ids advertised in `next` but not in `previous`, in `next`'s order. Empty when `previous` advertised none (first probe). */
export const newlyAdvertisedModelIds = (
  previous: ConfigOptionIndex | undefined,
  next: ConfigOptionIndex,
): readonly string[] => {
  const before = new Set(advertisedModelChoices(previous).map(choice => choice.id));
  return before.size === 0
    ? []
    : advertisedModelChoices(next)
        .map(choice => choice.id)
        .filter(id => !before.has(id));
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

/** A Session configuration rebuilt from recorded option values: the model's row with each recorded value as current (a Restored subagent has no session to read it from). */
export const configurationFromValues = (
  index: ConfigOptionIndex | undefined,
  values: ConfigOptionValues,
): readonly NormalizedConfigOption[] | undefined => {
  if (index === undefined) {
    return undefined;
  }
  const { model } = values;
  return optionsWithValues(rowForModel(index, typeof model === 'string' ? model : index.defaultModelId), values);
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

/** `modelId` is Hidden while `replacement` (a candidate to replace it) is shown: hiding only matters when another model is shown. */
const hiddenWhileOtherShown = (prefs: ModelPickerPrefs, modelId: string, replacement: string): boolean =>
  prefs.hidden.includes(modelId) && !prefs.hidden.includes(replacement);

/**
 * Default starting model (no recommendation): the default when shown, else the first shown usable model in Model
 * order. When every usable model is hidden, hiding is ignored (the default if usable, else the first usable); with
 * nothing usable, the default.
 */
const defaultStartingModelId = (index: ConfigOptionIndex, prefs: ModelPickerPrefs): string => {
  const hidden = new Set(prefs.hidden);
  const unavailable = new Set(index.unavailableModelIds);
  const usable = orderedModelIds(
    advertisedModelChoices(index).map(choice => choice.id),
    prefs.order,
  ).filter(id => !unavailable.has(id));
  const shown = usable.filter(id => !hidden.has(id));
  const candidates = shown.length > 0 ? shown : usable;
  return candidates.includes(index.defaultModelId) ? index.defaultModelId : (candidates[0] ?? index.defaultModelId);
};

/**
 * Starting model for automatic choices (new Session, Handoff target, fallbacks): the provider's Recommended model
 * when it is usable and shown, else the default starting model.
 */
export const startingModelId = (index: ConfigOptionIndex, prefs: ModelPickerPrefs): string => {
  const fallback = defaultStartingModelId(index, prefs);
  const modelOption = defaultModelOption(index);
  const recommended = modelOption === undefined ? undefined : validRecommendedValue(modelOption);
  if (recommended === undefined || index.unavailableModelIds.includes(recommended)) {
    return fallback;
  }
  return hiddenWhileOtherShown(prefs, recommended, fallback) ? fallback : recommended;
};

/** Entries of `picked` that the blob itself set (not fallbacks `preserveConfigValuesOnModelChange` filled in). */
const onlyBlobKeys = (blob: ConfigOptionValues, picked: ConfigOptionValues): ConfigOptionValues =>
  Object.fromEntries(Object.entries(picked).filter(([key, value]) => blob[key] === value));

export const hardResetForAgent = (
  index: ConfigOptionIndex | undefined,
  prefs: ModelPickerPrefs,
): {
  readonly options: readonly NormalizedConfigOption[];
  readonly values: ConfigOptionValues;
} => {
  if (index === undefined) {
    return { options: [], values: {} };
  }
  const options = rowForModel(index, startingModelId(index, prefs));
  return { options, values: recommendedConfigValues(options) };
};

/**
 * A Virtual draft's values as displayed and sent: the model's Recommended row values, overridden per key by the
 * blob's own picks (blob values for options absent from the row are dropped). The row of a model that is not
 * hydrated yet is the model select alone (known limitation: its other options resolve once the row hydrates).
 */
export const effectiveVirtualValues = (
  index: ConfigOptionIndex | undefined,
  prefs: ModelPickerPrefs,
  blobValues: ConfigOptionValues,
): ConfigOptionValues => {
  if (index === undefined) {
    return blobValues;
  }
  const model = typeof blobValues.model === 'string' ? blobValues.model : startingModelId(index, prefs);
  const row = rowForModel(index, model);
  const picked = preserveConfigValuesOnModelChange({ ...blobValues, model }, row);
  return { ...recommendedConfigValues(row), ...onlyBlobKeys(blobValues, picked), model };
};

/** Prefer stored values when still valid against index; unavailable/missing model → defaultModelId. */
export const sanitizeConfigValuesForIndex = (
  index: ConfigOptionIndex | undefined,
  values: ConfigOptionValues,
  prefs: ModelPickerPrefs,
): ConfigOptionValues => {
  if (index === undefined) {
    return values;
  }
  const starting = startingModelId(index, prefs);
  const modelId = typeof values.model === 'string' ? values.model : starting;
  // A hidden stored model is replaced only when another model is shown (starting is shown).
  const modelOk =
    isKnownModel(index, modelId) &&
    !index.unavailableModelIds.includes(modelId) &&
    !hiddenWhileOtherShown(prefs, modelId, starting);
  const effectiveModel = modelOk ? modelId : starting;
  if (!isHydrated(index, effectiveModel)) {
    return { ...values, model: effectiveModel };
  }
  // A replaced model takes the recommended row values, not the stored ones (they belonged to another model).
  return preserveConfigValuesOnModelChange(
    { ...(modelOk ? values : {}), model: effectiveModel },
    index.byModel[effectiveModel],
  );
};

/**
 * Activation reset for a loaded Session: the agent's load response wins over a possibly stale index, so values are
 * kept unless the loaded model is Unavailable; then the default row's *current* values (never the recommended ones).
 */
export const unavailableModelReset = (
  index: ConfigOptionIndex | undefined,
  loadedValues: ConfigOptionValues,
  prefs: ModelPickerPrefs,
): ConfigOptionValues => {
  const { model } = loadedValues;
  if (index === undefined || typeof model !== 'string' || !index.unavailableModelIds.includes(model)) {
    return loadedValues;
  }
  return configValuesFromOptions(rowForModel(index, defaultStartingModelId(index, prefs)));
};

export const resetUnsupportedConfigValues = (
  index: ConfigOptionIndex | undefined,
  values: ConfigOptionValues,
  prefs: ModelPickerPrefs,
): ConfigOptionValues => {
  if (index === undefined) return values;
  const modelId = values.model;
  if (typeof modelId !== 'string' || !isKnownModel(index, modelId) || index.unavailableModelIds.includes(modelId)) {
    return hardResetForAgent(index, prefs).values;
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
          : (validRecommendedValue(option) ?? option.currentValue ?? '');
    } else {
      next[option.id] = typeof value === 'boolean' ? value : (option.currentValue ?? false);
    }
  }
  return next;
};
