/** Hidden models + Model order: pure helpers shared by model selects and Settings > Providers. */

export type ModelPickerPrefs = {
  readonly hidden: readonly string[];
  readonly order: readonly string[];
};

export const EMPTY_MODEL_PICKER_PREFS: ModelPickerPrefs = { hidden: [], order: [] };

/** Advertised ids in Model order: listed ones first (stale ids ignored), the rest follow in the agent's order. */
export const orderedModelIds = (advertisedIds: readonly string[], order: readonly string[]): readonly string[] => {
  const advertised = new Set(advertisedIds);
  const listed = [...new Set(order)].filter(id => advertised.has(id));
  const listedSet = new Set(listed);
  return [...listed, ...advertisedIds.filter(id => !listedSet.has(id))];
};

/**
 * Choices for a model select: Model order applied, Hidden models dropped unless one is `currentId` (or every model is hidden)
 * (kept at its place so the current value still renders).
 */
export const arrangeModelChoices = <T extends { readonly id: string }>(
  choices: readonly T[],
  options: ModelPickerPrefs & { readonly currentId: string | undefined },
): readonly T[] => {
  const byId = new Map(choices.map(choice => [choice.id, choice]));
  const hidden = new Set(options.hidden);
  const ids = orderedModelIds(
    choices.map(choice => choice.id),
    options.order,
  );
  // Hiding every model would leave nothing to pick: ignore it.
  const hideAll = ids.every(id => hidden.has(id));
  return ids.filter(id => hideAll || !hidden.has(id) || id === options.currentId).flatMap(id => byId.get(id) ?? []);
};

/** Hidden ids for the advertised models only. Render-time only: writes keep unadvertised ids, since the cache may be partial. */
export const pruneHidden = (advertisedIds: readonly string[], hidden: readonly string[]): readonly string[] => {
  const hiddenSet = new Set(hidden);
  return advertisedIds.filter(id => hiddenSet.has(id));
};

export const setModelHidden = (hidden: readonly string[], modelId: string, hide: boolean): readonly string[] => {
  const next = new Set(hidden);
  if (hide) {
    next.add(modelId);
  } else {
    next.delete(modelId);
  }
  return [...next];
};

/** Hide or show every advertised model; unadvertised hidden ids are kept. */
export const setAllModelsHidden = (
  advertisedIds: readonly string[],
  hidden: readonly string[],
  hide: boolean,
): readonly string[] => {
  const advertised = new Set(advertisedIds);
  const kept = hidden.filter(id => !advertised.has(id));
  return hide ? [...kept, ...advertisedIds] : kept;
};

/** Move `fromId` to `toId`'s slot. Ids in `order` that are not advertised are kept after the advertised ones. */
export const reorderModels = (
  advertisedIds: readonly string[],
  order: readonly string[],
  fromId: string,
  toId: string,
): readonly string[] => {
  const ids = [...orderedModelIds(advertisedIds, order)];
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from !== -1 && to !== -1 && from !== to) {
    ids.splice(from, 1);
    ids.splice(to, 0, fromId);
  }
  const advertised = new Set(ids);
  return [...ids, ...order.filter(id => !advertised.has(id))];
};
