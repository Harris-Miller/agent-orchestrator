import { assert, describe, it } from '@effect/vitest';

import {
  hardResetForAgent,
  needsLazyHydrate,
  resetUnsupportedConfigValues,
  rowForModel,
  sanitizeConfigValuesForIndex,
} from './configOptionIndexUi.ts';
import { configOptionIndexFromProbeResponses } from './configOptionIndexFixtures.ts';

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
    const sanitized = sanitizeConfigValuesForIndex(index, { mode: 'default', model: 'opus' });
    assert.strictEqual(sanitized.model, 'sonnet');
  });

  it('returns values unchanged when index missing', () => {
    const values = { model: 'x' };
    assert.strictEqual(sanitizeConfigValuesForIndex(undefined, values), values);
  });
});

describe('hardResetForAgent', () => {
  it('returns empty when no index', () => {
    assert.deepStrictEqual(hardResetForAgent(undefined), { options: [], values: {} });
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
    assert.deepStrictEqual(resetUnsupportedConfigValues(index, { model: 'gone', mode: 'custom' }), {
      model: 'sonnet',
      mode: 'default',
    });
    assert.deepStrictEqual(resetUnsupportedConfigValues(index, { model: 'sonnet', mode: 'default', removed: 'x' }), {
      model: 'sonnet',
      mode: 'default',
    });
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
    assert.deepStrictEqual(resetUnsupportedConfigValues(fresh, { model: 'opus' }), { model: 'opus' });
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
    assert.deepStrictEqual(sanitizeConfigValuesForIndex(seeded, { effort: 'high', model: 'opus' }), {
      effort: 'high',
      model: 'opus',
    });
    assert.deepStrictEqual(resetUnsupportedConfigValues(seeded, { effort: 'high', model: 'opus' }), {
      effort: 'high',
      model: 'opus',
    });
  });

  it('reset still falls back to default for a model that is not advertised', () => {
    assert.strictEqual(resetUnsupportedConfigValues(seeded, { model: 'nope' }).model, 'sonnet');
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
