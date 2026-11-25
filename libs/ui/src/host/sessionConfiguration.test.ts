import { assert, describe, it } from '@effect/vitest';

import type { SessionConfiguration } from './acpSessionBootstrap.ts';
import {
  configValue,
  configValueDiffs,
  foldConfigOptions,
  recommendedValueDiffs,
  withConfigValue,
} from './sessionConfiguration.ts';

const modelAndMode: SessionConfiguration = [
  {
    choices: [
      { id: 'echo-model', name: 'Echo Model' },
      { id: 'echo-model-verbose', name: 'Echo Model (verbose)' },
    ],
    currentValue: 'echo-model',
    id: 'model',
    name: 'Model',
    type: 'select',
  },
  {
    choices: [
      { id: 'default', name: 'Default' },
      { id: 'plan', name: 'Plan' },
    ],
    currentValue: 'default',
    id: 'mode',
    name: 'Mode',
    type: 'select',
  },
];

describe('foldConfigOptions recommendedValue', () => {
  const previous: SessionConfiguration = [
    {
      choices: [
        { id: 'low', name: 'Low' },
        { id: 'medium', name: 'Medium' },
        { id: 'high', name: 'High' },
      ],
      currentValue: 'low',
      id: 'effort',
      name: 'Effort',
      recommendedValue: 'medium',
      type: 'select',
    },
  ];
  const fold = (prev: SessionConfiguration, entry: Record<string, unknown>) =>
    foldConfigOptions(prev, { configOptions: [{ id: 'effort', type: 'select', currentValue: 'high', ...entry }] })?.[0];

  it('keeps the previous recommendedValue when the entry omits _meta', () => {
    const option = fold(previous, {});
    assert.strictEqual(option?.type === 'select' ? option.recommendedValue : undefined, 'medium');
  });

  it('lets the entry _meta override the inherited recommendedValue', () => {
    const option = fold(previous, { _meta: { jetbrains: { air: { recommendedValue: 'high', version: 1 } } } });
    assert.strictEqual(option?.type === 'select' ? option.recommendedValue : undefined, 'high');
  });

  it('has no recommendedValue key when the previous option had none', () => {
    const { recommendedValue: _omit, ...bare } = previous[0] as Extract<
      SessionConfiguration[number],
      { type: 'select' }
    >;
    const option = fold([bare], {});
    assert.isFalse(option !== undefined && 'recommendedValue' in option);
  });
});

describe('foldConfigOptions', () => {
  it('takes the report as the full id set: absent ids drop, new ids appear with their value', () => {
    const folded = foldConfigOptions(modelAndMode, {
      configOptions: [
        {
          currentValue: 'high',
          id: 'effort',
          name: 'Effort',
          options: [
            { name: 'Low', value: 'low' },
            { name: 'High', value: 'high' },
          ],
          type: 'select',
        },
      ],
    });

    assert.deepStrictEqual(folded, [
      {
        category: undefined,
        choices: [
          { id: 'low', name: 'Low' },
          { id: 'high', name: 'High' },
        ],
        currentValue: 'high',
        description: undefined,
        id: 'effort',
        name: 'Effort',
        type: 'select',
      },
    ]);
  });

  it('keeps the previous choices and name of an option whose report omits them', () => {
    const folded = foldConfigOptions(modelAndMode, {
      configOptions: [{ currentValue: 'echo-model-verbose', id: 'model', type: 'select' }],
    });

    assert.deepStrictEqual(folded, [
      {
        category: undefined,
        choices: [
          { id: 'echo-model', name: 'Echo Model' },
          { id: 'echo-model-verbose', name: 'Echo Model (verbose)' },
        ],
        currentValue: 'echo-model-verbose',
        description: undefined,
        id: 'model',
        name: 'Model',
        type: 'select',
      },
    ]);
  });

  it('returns the same configuration for a report without configOptions', () => {
    assert.strictEqual(foldConfigOptions(modelAndMode, {}), modelAndMode);
    assert.strictEqual(foldConfigOptions(modelAndMode, undefined), modelAndMode);
  });

  it('parses the report alone when there is no configuration yet', () => {
    const folded = foldConfigOptions(undefined, {
      configOptions: [{ currentValue: true, id: 'brave', name: 'Brave', type: 'boolean' }],
    });

    assert.deepStrictEqual(folded, [
      { category: undefined, currentValue: true, description: undefined, id: 'brave', name: 'Brave', type: 'boolean' },
    ]);
  });
});

const withBrave: SessionConfiguration = [
  ...modelAndMode,
  { currentValue: false, id: 'brave', name: 'Brave', type: 'boolean' },
];

describe('withConfigValue', () => {
  it('changes only that option value (select and boolean)', () => {
    const selected = withConfigValue(withBrave, 'model', 'echo-model-verbose');
    assert.strictEqual(configValue(selected, 'model'), 'echo-model-verbose');
    assert.deepStrictEqual(selected[0].type === 'select' ? selected[0].choices : [], [
      { id: 'echo-model', name: 'Echo Model' },
      { id: 'echo-model-verbose', name: 'Echo Model (verbose)' },
    ]);
    assert.strictEqual(selected[1], withBrave[1]);

    assert.strictEqual(configValue(withConfigValue(withBrave, 'brave', true), 'brave'), true);
  });

  it('clears the value when given undefined', () => {
    assert.isUndefined(configValue(withConfigValue(withBrave, 'mode', undefined), 'mode'));
  });

  it('leaves the configuration alone for an unknown id or a value of the wrong type', () => {
    assert.deepStrictEqual(withConfigValue(withBrave, 'missing', 'x'), withBrave);
    assert.deepStrictEqual(withConfigValue(withBrave, 'model', true), withBrave);
    assert.deepStrictEqual(withConfigValue(withBrave, 'brave', 'yes'), withBrave);
  });
});

describe('configValue', () => {
  it('reads select and boolean values', () => {
    assert.strictEqual(configValue(withBrave, 'mode'), 'default');
    assert.strictEqual(configValue(withBrave, 'brave'), false);
  });

  it('is undefined for an unknown id or no configuration', () => {
    assert.isUndefined(configValue(withBrave, 'missing'));
    assert.isUndefined(configValue(undefined, 'model'));
  });
});

describe('configValueDiffs', () => {
  it('diffs a select only to a valid, different choice', () => {
    assert.deepStrictEqual(configValueDiffs(withBrave, { mode: 'plan', model: 'echo-model' }), [
      { configId: 'mode', type: 'select', value: 'plan' },
    ]);
    assert.deepStrictEqual(configValueDiffs(withBrave, { model: 'not-offered' }), []);
  });

  it('diffs a boolean only when it differs', () => {
    assert.deepStrictEqual(configValueDiffs(withBrave, { brave: true }), [
      { configId: 'brave', type: 'boolean', value: true },
    ]);
    assert.deepStrictEqual(configValueDiffs(withBrave, { brave: false }), []);
  });

  it('has no diff for ids missing from the values', () => {
    assert.deepStrictEqual(configValueDiffs(withBrave, {}), []);
  });
});

describe('recommendedValueDiffs', () => {
  const effort = (currentValue: string, recommendedValue?: string): SessionConfiguration[number] => ({
    choices: ['low', 'high'].map(id => ({ id, name: id })),
    currentValue,
    id: 'effort',
    name: 'Effort',
    ...(recommendedValue === undefined ? {} : { recommendedValue }),
    type: 'select',
  });

  it('diffs a select whose valid recommendation differs from its current value', () => {
    assert.deepStrictEqual(recommendedValueDiffs([effort('low', 'high')], new Set()), [
      { configId: 'effort', type: 'select', value: 'high' },
    ]);
  });

  it('skips user-set keys, matching values, missing and invalid recommendations, and booleans', () => {
    assert.deepStrictEqual(recommendedValueDiffs([effort('low', 'high')], new Set(['effort'])), []);
    assert.deepStrictEqual(recommendedValueDiffs([effort('high', 'high')], new Set()), []);
    assert.deepStrictEqual(recommendedValueDiffs([effort('low')], new Set()), []);
    assert.deepStrictEqual(recommendedValueDiffs([effort('low', 'bogus')], new Set()), []);
    assert.deepStrictEqual(
      recommendedValueDiffs([{ currentValue: false, id: 'fast', name: 'Fast', type: 'boolean' }], new Set()),
      [],
    );
  });
});
