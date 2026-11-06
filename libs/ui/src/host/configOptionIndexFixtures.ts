/** Test-only builders for Config option indexes. */
import { normalizeConfigOptions } from './acpSessionBootstrap.ts';
import type { ConfigOptionIndex } from './configProbe.ts';

/** Build index from raw responses stored as-is per model id (no cross-model merge). */
export const configOptionIndexFromProbeResponses = (
  defaultModelId: string,
  byModelRaw: Readonly<Record<string, unknown>>,
  unavailableModelIds: readonly string[] = [],
): ConfigOptionIndex => ({
  byModel: Object.fromEntries(
    Object.entries(byModelRaw).map(([modelId, raw]) => [modelId, normalizeConfigOptions(raw)]),
  ),
  defaultModelId,
  unavailableModelIds,
});

export const modelOption = (current: string, ids: readonly string[]) => ({
  currentValue: current,
  id: 'model',
  name: 'Model',
  options: ids.map(id => ({ name: id, value: id })),
  type: 'select',
});

export const effortOption = (current: string) => ({
  currentValue: current,
  id: 'effort',
  name: 'Effort',
  options: [
    { name: 'Low', value: 'low' },
    { name: 'High', value: 'high' },
  ],
  type: 'select',
});

export const rowIds = (index: ConfigOptionIndex | undefined, modelId: string) =>
  index?.byModel[modelId]?.map(option => option.id);
