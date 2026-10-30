import { assert, describe, it } from '@effect/vitest';

import { hardResetForAgent, reconcileConfigValues, sanitizeConfigValuesForIndex } from './configOptionIndexUi.ts';
import { configOptionIndexFromProbeResponses } from './configProbe.ts';

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

describe('reconcileConfigValues', () => {
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
    assert.deepStrictEqual(reconcileConfigValues(index, { model: 'gone', mode: 'custom' }), {
      model: 'sonnet',
      mode: 'default',
    });
    assert.deepStrictEqual(reconcileConfigValues(index, { model: 'sonnet', mode: 'default', removed: 'x' }), {
      model: 'sonnet',
      mode: 'default',
    });
  });
});
