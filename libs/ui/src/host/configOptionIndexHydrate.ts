/** Lazy hydrate: fold live ACP responses into the Config option index. */
import { normalizeConfigOptions, normalizeModels } from './acpSessionBootstrap.ts';
import type { ConfigOptionIndex } from './configProbe.ts';
import { isModelOption } from './configOptionIndexUi.ts';

/** Live ACP response that updates the Config option index (Lazy hydrate). */
export type ConfigIndexEvent =
  | { readonly _tag: 'SessionNew'; readonly response: unknown }
  | { readonly _tag: 'ModelPicked'; readonly modelId: string; readonly response: unknown }
  | { readonly _tag: 'ModelPickFailed'; readonly modelId: string };

/**
 * A successful pick's response carries the full advertised model list: replace the default row's choices, drop rows
 * and Unavailable marks of models no longer advertised, and move the default to the picked model if it was dropped.
 */
const mergeModelPicked = (
  previous: ConfigOptionIndex,
  modelId: string,
  response: unknown,
  otherRows: ConfigOptionIndex['byModel'],
  otherUnavailable: readonly string[],
): ConfigOptionIndex => {
  const row = normalizeConfigOptions(response);
  const pickedModel = row.find(isModelOption);
  if (pickedModel?.type !== 'select') {
    return { ...previous, byModel: { ...otherRows, [modelId]: row }, unavailableModelIds: otherUnavailable };
  }
  const advertised = new Set(pickedModel.choices.map(choice => choice.id));
  const defaultModelId = advertised.has(previous.defaultModelId) ? previous.defaultModelId : modelId;
  const kept = Object.entries(otherRows).flatMap(([id, options]) => {
    if (!advertised.has(id) && id !== defaultModelId) {
      return [];
    }
    const patched =
      id === previous.defaultModelId
        ? options.map(option =>
            isModelOption(option) && option.type === 'select' ? { ...option, choices: pickedModel.choices } : option,
          )
        : options;
    return [[id, patched] as const];
  });
  return {
    byModel: { ...Object.fromEntries(kept), [modelId]: row },
    defaultModelId,
    unavailableModelIds: otherUnavailable.filter(id => advertised.has(id)),
  };
};

/**
 * Lazy hydrate: fold one live response into the index. `SessionNew` replaces the default row and model list
 * (dropping rows for models no longer advertised); model events need an existing index and are ignored without one.
 */
export const mergeConfigOptionIndex = (
  previous: ConfigOptionIndex | undefined,
  event: ConfigIndexEvent,
): ConfigOptionIndex | undefined => {
  if (event._tag === 'SessionNew') {
    const models = normalizeModels(event.response);
    if (models.currentId === undefined) {
      return previous;
    }
    const advertised = new Set(models.options.map(entry => entry.id));
    advertised.add(models.currentId);
    const kept = Object.entries(previous?.byModel ?? {}).filter(([modelId]) => advertised.has(modelId));
    return {
      byModel: { ...Object.fromEntries(kept), [models.currentId]: normalizeConfigOptions(event.response) },
      defaultModelId: models.currentId,
      unavailableModelIds: (previous?.unavailableModelIds ?? []).filter(modelId => advertised.has(modelId)),
    };
  }
  if (previous === undefined) {
    return previous;
  }
  const { [event.modelId]: _dropped, ...otherRows } = previous.byModel;
  const otherUnavailable = previous.unavailableModelIds.filter(modelId => modelId !== event.modelId);
  if (event._tag === 'ModelPicked') {
    return mergeModelPicked(previous, event.modelId, event.response, otherRows, otherUnavailable);
  }
  return { ...previous, byModel: otherRows, unavailableModelIds: [...otherUnavailable, event.modelId] };
};
