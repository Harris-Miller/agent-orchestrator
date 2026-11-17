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
 * Choices for a model select: Model order applied, Hidden models dropped unless one is `currentId`
 * (kept at its place so the current value still renders).
 */
export const arrangeModelChoices = <T extends { readonly id: string }>(
  choices: readonly T[],
  options: ModelPickerPrefs & { readonly currentId: string | undefined },
): readonly T[] => {
  const byId = new Map(choices.map(choice => [choice.id, choice]));
  const hidden = new Set(options.hidden);
  return orderedModelIds(
    choices.map(choice => choice.id),
    options.order,
  )
    .filter(id => !hidden.has(id) || id === options.currentId)
    .flatMap(id => byId.get(id) ?? []);
};

/** Hidden ids for the advertised models only (stale ids pruned). */
export const pruneHidden = (advertisedIds: readonly string[], hidden: readonly string[]): readonly string[] => {
  const hiddenSet = new Set(hidden);
  return advertisedIds.filter(id => hiddenSet.has(id));
};

export const setModelHidden = (
  advertisedIds: readonly string[],
  hidden: readonly string[],
  modelId: string,
  hide: boolean,
): readonly string[] => {
  const next = new Set(hidden);
  if (hide) {
    next.add(modelId);
  } else {
    next.delete(modelId);
  }
  return pruneHidden(advertisedIds, [...next]);
};

export const setAllModelsHidden = (advertisedIds: readonly string[], hide: boolean): readonly string[] =>
  hide ? [...advertisedIds] : [];

/** Move `fromId` to `toId`'s slot; returns the full pruned order. Unknown ids leave the order unchanged. */
export const reorderModels = (
  advertisedIds: readonly string[],
  order: readonly string[],
  fromId: string,
  toId: string,
): readonly string[] => {
  const ids = [...orderedModelIds(advertisedIds, order)];
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from === -1 || to === -1 || from === to) {
    return ids;
  }
  ids.splice(from, 1);
  ids.splice(to, 0, fromId);
  return ids;
};
