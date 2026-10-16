import { assert, describe, it } from '@effect/vitest';

import { hardResetForAgent, sanitizeConfigValuesForIndex } from './configOptionIndexUi.ts';
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
