import { assert, describe, it } from '@effect/vitest';

import {
  effectiveVirtualValues,
  hardResetForAgent,
  needsLazyHydrate,
  newlyAdvertisedModelIds,
  recommendedConfigValues,
  resetUnsupportedConfigValues,
  rowForModel,
  sanitizeConfigValuesForIndex,
  startingModelId,
  unavailableModelReset,
} from './configOptionIndexUi.ts';
import { configOptionIndexFromProbeResponses, effortOption, modelSelectOption } from './configOptionIndexFixtures.ts';
import { EMPTY_MODEL_PICKER_PREFS } from './modelPickerPrefs.ts';

describe('sanitizeConfigValuesForIndex', () => {
  it('maps unavailable model to defaultModelId', () => {
    const index = configOptionIndexFromProbeResponses(
      'sonnet',
      {
        sonnet: {
          configOptions: [
            {
              currentValue: 'sonnet',
              id: 'model',
              name: 'Model',
              options: [
                { name: 'Sonnet', value: 'sonnet' },
                { name: 'Opus', value: 'opus' },
              ],
              type: 'select',
            },
          ],
        },
      },
      ['opus'],
    );
    const sanitized = sanitizeConfigValuesForIndex(index, { mode: 'default', model: 'opus' }, EMPTY_MODEL_PICKER_PREFS);
    assert.strictEqual(sanitized.model, 'sonnet');
  });

  it('returns values unchanged when index missing', () => {
    const values = { model: 'x' };
    assert.strictEqual(sanitizeConfigValuesForIndex(undefined, values, EMPTY_MODEL_PICKER_PREFS), values);
  });
});

describe('hardResetForAgent', () => {
  it('returns empty when no index', () => {
    assert.deepStrictEqual(hardResetForAgent(undefined, EMPTY_MODEL_PICKER_PREFS), { options: [], values: {} });
  });
});

describe('resetUnsupportedConfigValues', () => {
  const index = configOptionIndexFromProbeResponses('sonnet', {
    sonnet: {
      configOptions: [
        {
          currentValue: 'sonnet',
          id: 'model',
          name: 'Model',
          options: [{ name: 'Sonnet', value: 'sonnet' }],
          type: 'select',
        },
        {
          currentValue: 'default',
          id: 'mode',
          name: 'Mode',
          options: [{ name: 'Default', value: 'default' }],
          type: 'select',
        },
      ],
    },
  });
  it('resets removed models and invalid choices, preserving valid values and dropping removed ids', () => {
    assert.deepStrictEqual(
      resetUnsupportedConfigValues(index, { model: 'gone', mode: 'custom' }, EMPTY_MODEL_PICKER_PREFS),
      {
        model: 'sonnet',
        mode: 'default',
      },
    );
    assert.deepStrictEqual(
      resetUnsupportedConfigValues(index, { model: 'sonnet', mode: 'default', removed: 'x' }, EMPTY_MODEL_PICKER_PREFS),
      {
        model: 'sonnet',
        mode: 'default',
      },
    );
  });

  it('keeps a still-valid user pick when a fresh probe publishes over a cached index', () => {
    const probe = (currentValue: string) => ({
      configOptions: [
        {
          currentValue,
          id: 'model',
          name: 'Model',
          options: [
            { name: 'Sonnet', value: 'sonnet' },
            { name: 'Opus', value: 'opus' },
          ],
          type: 'select' as const,
        },
      ],
    });
    const fresh = configOptionIndexFromProbeResponses('sonnet', { opus: probe('opus'), sonnet: probe('sonnet') });
    assert.deepStrictEqual(resetUnsupportedConfigValues(fresh, { model: 'opus' }, EMPTY_MODEL_PICKER_PREFS), {
      model: 'opus',
    });
  });
});

describe('uncached (lazily hydrated) models', () => {
  const seeded = configOptionIndexFromProbeResponses('sonnet', {
    sonnet: {
      configOptions: [
        {
          currentValue: 'sonnet',
          id: 'model',
          name: 'Model',
          options: [
            { name: 'Sonnet', value: 'sonnet' },
            { name: 'Opus', value: 'opus' },
          ],
          type: 'select',
        },
      ],
    },
  });

  it('rowForModel falls back to the model select alone for an advertised model without a row', () => {
    const row = rowForModel(seeded, 'opus');
    assert.deepStrictEqual(
      row.map(option => option.id),
      ['model'],
    );
    assert.strictEqual(row[0]?.currentValue, 'opus');
    assert.deepStrictEqual(rowForModel(seeded, 'nope'), []);
  });

  it('sanitize and reset keep an advertised-but-uncached model and its values', () => {
    assert.deepStrictEqual(
      sanitizeConfigValuesForIndex(seeded, { effort: 'high', model: 'opus' }, EMPTY_MODEL_PICKER_PREFS),
      {
        effort: 'high',
        model: 'opus',
      },
    );
    assert.deepStrictEqual(
      resetUnsupportedConfigValues(seeded, { effort: 'high', model: 'opus' }, EMPTY_MODEL_PICKER_PREFS),
      {
        effort: 'high',
        model: 'opus',
      },
    );
  });

  it('reset still falls back to default for a model that is not advertised', () => {
    assert.strictEqual(
      resetUnsupportedConfigValues(seeded, { model: 'nope' }, EMPTY_MODEL_PICKER_PREFS).model,
      'sonnet',
    );
  });
});

describe('needsLazyHydrate', () => {
  const index = configOptionIndexFromProbeResponses(
    'sonnet',
    {
      sonnet: {
        configOptions: [
          {
            currentValue: 'sonnet',
            id: 'model',
            name: 'Model',
            options: [
              { name: 'Sonnet', value: 'sonnet' },
              { name: 'Opus', value: 'opus' },
              { name: 'Haiku', value: 'haiku' },
            ],
            type: 'select',
          },
        ],
      },
      haiku: { configOptions: [] },
    },
    [],
  );

  it('is true for an advertised uncached model with a Bound session', () => {
    assert.isTrue(needsLazyHydrate(index, 'bound-1', 'opus'));
  });

  it('is false without a Bound session (model select only, no RPC)', () => {
    assert.isFalse(needsLazyHydrate(index, undefined, 'opus'));
  });

  it('is false for a cached, unadvertised, or unavailable model', () => {
    assert.isFalse(needsLazyHydrate(index, 'bound-1', 'haiku'));
    assert.isFalse(needsLazyHydrate(index, 'bound-1', 'nope'));
    assert.isFalse(needsLazyHydrate({ ...index, unavailableModelIds: ['opus'] }, 'bound-1', 'opus'));
    assert.isFalse(needsLazyHydrate(undefined, 'bound-1', 'opus'));
  });
});

describe('Hidden models and the Starting model', () => {
  const four = (unavailable: readonly string[] = []) =>
    configOptionIndexFromProbeResponses(
      'sonnet',
      {
        haiku: { configOptions: [modelSelectOption('haiku', ['sonnet', 'opus', 'haiku'])] },
        opus: { configOptions: [modelSelectOption('opus', ['sonnet', 'opus', 'haiku'])] },
        sonnet: { configOptions: [modelSelectOption('sonnet', ['sonnet', 'opus', 'haiku'])] },
      },
      unavailable,
    );
  const prefs = (hidden: readonly string[], order: readonly string[] = []) => ({ hidden, order });

  it('startingModelId: default when shown', () => {
    assert.strictEqual(startingModelId(four(), prefs(['opus'])), 'sonnet');
  });

  it('startingModelId: default hidden -> first shown in Model order', () => {
    assert.strictEqual(startingModelId(four(), prefs(['sonnet'])), 'opus');
    assert.strictEqual(startingModelId(four(), prefs(['sonnet'], ['haiku'])), 'haiku');
  });

  it('startingModelId: default unavailable -> first shown usable', () => {
    assert.strictEqual(startingModelId(four(['sonnet']), EMPTY_MODEL_PICKER_PREFS), 'opus');
  });

  it('startingModelId: everything hidden -> default', () => {
    assert.strictEqual(startingModelId(four(), prefs(['sonnet', 'opus', 'haiku'])), 'sonnet');
  });

  it('startingModelId: hidden and unavailable mix', () => {
    assert.strictEqual(startingModelId(four(['opus']), prefs(['sonnet'])), 'haiku');
  });

  it('startingModelId: every usable model hidden and the default unavailable -> first usable, never the unavailable one', () => {
    assert.strictEqual(startingModelId(four(['sonnet']), prefs(['opus', 'haiku'])), 'opus');
  });

  it('hardResetForAgent starts on a shown model when the default is hidden', () => {
    assert.strictEqual(hardResetForAgent(four(), prefs(['sonnet'])).values.model, 'opus');
  });

  it('sanitize replaces a stored hidden model with the Starting model', () => {
    assert.strictEqual(sanitizeConfigValuesForIndex(four(), { model: 'opus' }, prefs(['opus'])).model, 'sonnet');
    assert.strictEqual(sanitizeConfigValuesForIndex(four(), {}, prefs(['sonnet'])).model, 'opus');
  });

  it('sanitize keeps a stored hidden model when every model is hidden', () => {
    const all = prefs(['sonnet', 'opus', 'haiku']);
    assert.strictEqual(sanitizeConfigValuesForIndex(four(), { model: 'opus' }, all).model, 'opus');
  });

  it('reset keeps a hidden-but-valid model', () => {
    assert.strictEqual(resetUnsupportedConfigValues(four(), { model: 'opus' }, prefs(['opus'])).model, 'opus');
  });

  it('reset of an unavailable model falls back to the Starting model, not a hidden one', () => {
    assert.strictEqual(
      resetUnsupportedConfigValues(four(['haiku']), { model: 'haiku' }, prefs(['sonnet'])).model,
      'opus',
    );
  });
});

describe('newlyAdvertisedModelIds', () => {
  const index = (ids: readonly string[]) =>
    configOptionIndexFromProbeResponses('a', { a: { configOptions: [modelSelectOption('a', ids)] } });

  it('lists ids advertised now but not before, in next order', () => {
    assert.deepStrictEqual(newlyAdvertisedModelIds(index(['a', 'b']), index(['n1', 'a', 'b', 'n2'])), ['n1', 'n2']);
  });

  it('is empty on the first probe', () => {
    assert.deepStrictEqual(newlyAdvertisedModelIds(undefined, index(['a', 'b'])), []);
  });
});

describe('Recommended value', () => {
  const air = (recommendedValue: string) => ({ _meta: { jetbrains: { air: { recommendedValue, version: 1 } } } });
  const effort = (current: string, recommended?: string) => ({
    ...effortOption(current),
    ...(recommended === undefined ? {} : air(recommended)),
  });
  const model = (current: string, recommended?: string) => ({
    ...modelSelectOption(current, ['sonnet', 'opus']),
    ...(recommended === undefined ? {} : air(recommended)),
  });
  const withRecs = (unavailable: readonly string[] = []) =>
    configOptionIndexFromProbeResponses(
      'sonnet',
      {
        opus: { configOptions: [model('opus', 'opus'), effort('low', 'high')] },
        sonnet: { configOptions: [model('sonnet', 'opus'), effort('low', 'high')] },
      },
      unavailable,
    );
  const prefs = (hidden: readonly string[]) => ({ hidden, order: [] });

  it('startingModelId prefers the recommended model', () => {
    assert.strictEqual(startingModelId(withRecs(), EMPTY_MODEL_PICKER_PREFS), 'opus');
  });

  it('startingModelId skips a recommended model that is unavailable or hidden', () => {
    assert.strictEqual(startingModelId(withRecs(['opus']), EMPTY_MODEL_PICKER_PREFS), 'sonnet');
    assert.strictEqual(startingModelId(withRecs(), prefs(['opus'])), 'sonnet');
  });

  it('startingModelId ignores a recommendation that is not an advertised choice', () => {
    const index = configOptionIndexFromProbeResponses('sonnet', {
      sonnet: { configOptions: [model('sonnet', 'ghost')] },
    });
    assert.strictEqual(startingModelId(index, EMPTY_MODEL_PICKER_PREFS), 'sonnet');
  });

  it('startingModelId without recommendation keeps the default', () => {
    const index = configOptionIndexFromProbeResponses('sonnet', {
      sonnet: { configOptions: [model('sonnet')] },
    });
    assert.strictEqual(startingModelId(index, EMPTY_MODEL_PICKER_PREFS), 'sonnet');
  });

  it('recommendedConfigValues uses valid recommendations, else current values', () => {
    const row = rowForModel(withRecs(), 'opus');
    assert.deepStrictEqual(recommendedConfigValues(row), { effort: 'high', model: 'opus' });
    const bad = rowForModel(
      configOptionIndexFromProbeResponses('sonnet', {
        sonnet: { configOptions: [model('sonnet'), effort('low', 'ghost')] },
      }),
      'sonnet',
    );
    assert.deepStrictEqual(recommendedConfigValues(bad), { effort: 'low', model: 'sonnet' });
  });

  it('hardResetForAgent seeds recommended model and effort', () => {
    assert.deepStrictEqual(hardResetForAgent(withRecs(), EMPTY_MODEL_PICKER_PREFS).values, {
      effort: 'high',
      model: 'opus',
    });
  });

  it('effectiveVirtualValues: empty blob gets recommended, blob values win per key', () => {
    assert.deepStrictEqual(effectiveVirtualValues(withRecs(), EMPTY_MODEL_PICKER_PREFS, {}), {
      effort: 'high',
      model: 'opus',
    });
    assert.deepStrictEqual(effectiveVirtualValues(withRecs(), EMPTY_MODEL_PICKER_PREFS, { effort: 'low' }), {
      effort: 'low',
      model: 'opus',
    });
    assert.deepStrictEqual(
      effectiveVirtualValues(withRecs(), EMPTY_MODEL_PICKER_PREFS, { gone: 'x', model: 'sonnet' }),
      { effort: 'high', model: 'sonnet' },
    );
  });

  it('effectiveVirtualValues without an index returns the blob', () => {
    const blob = { model: 'x' };
    assert.strictEqual(effectiveVirtualValues(undefined, EMPTY_MODEL_PICKER_PREFS, blob), blob);
  });

  it('unavailableModelReset leaves loaded values alone unless the model is Unavailable', () => {
    const loaded = { effort: 'low', model: 'ghost' };
    assert.strictEqual(unavailableModelReset(withRecs(), loaded, EMPTY_MODEL_PICKER_PREFS), loaded);
    assert.strictEqual(unavailableModelReset(undefined, loaded, EMPTY_MODEL_PICKER_PREFS), loaded);
  });

  it('unavailableModelReset resets an Unavailable model to the default row current values, not recommended', () => {
    assert.deepStrictEqual(
      unavailableModelReset(withRecs(['opus']), { effort: 'high', model: 'opus' }, EMPTY_MODEL_PICKER_PREFS),
      { effort: 'low', model: 'sonnet' },
    );
  });
});
