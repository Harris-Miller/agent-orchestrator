/** Lazy hydrate: fold live ACP responses into the Config option index. */
import { normalizeConfigOptions, normalizeModels } from './acpSessionBootstrap.ts';
import type { ConfigOptionIndex } from './configProbe.ts';

/** Live ACP response that updates the Config option index (Lazy hydrate). */
export type ConfigIndexEvent =
  | { readonly _tag: 'SessionNew'; readonly response: unknown }
  | { readonly _tag: 'ModelPicked'; readonly modelId: string; readonly response: unknown }
  | { readonly _tag: 'ModelPickFailed'; readonly modelId: string };

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
    return {
      ...previous,
      byModel: { ...otherRows, [event.modelId]: normalizeConfigOptions(event.response) },
      unavailableModelIds: otherUnavailable,
    };
  }
  return { ...previous, byModel: otherRows, unavailableModelIds: [...otherUnavailable, event.modelId] };
};
