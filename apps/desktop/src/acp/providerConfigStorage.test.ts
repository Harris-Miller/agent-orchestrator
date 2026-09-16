import { assert, describe, it } from '@effect/vitest';

import type { NormalizedConfigOption } from './acpSessionBootstrap.ts';
import {
  defaultsEqual,
  harnessDefaultDiffs,
  mergeProviderConfigRefresh,
  refreshProviderConfigInMemory,
} from './providerConfigStorage.ts';
import type { ProviderConfigStored } from './providerConfigStorage.ts';

const modelOption = (currentValue: string, choiceIds: readonly string[]): NormalizedConfigOption => ({
  choices: choiceIds.map(id => ({ id, name: id })),
  currentValue,
  id: 'model',
  name: 'Model',
  type: 'select',
});

const modeOption = (currentValue: string, choiceIds: readonly string[]): NormalizedConfigOption => ({
  choices: choiceIds.map(id => ({ id, name: id })),
  currentValue,
  id: 'mode',
  name: 'Mode',
  type: 'select',
});

describe('mergeProviderConfigRefresh', () => {
  it('seeds defaults from currentValue on first write', () => {
    const merged = mergeProviderConfigRefresh(undefined, [
      modelOption('sonnet', ['sonnet', 'opus']),
      modeOption('default', ['default', 'plan']),
    ]);
    assert.deepStrictEqual(merged.defaults, { mode: 'default', model: 'sonnet' });
    assert.strictEqual(merged.catalog.length, 2);
    assert.strictEqual(merged.catalog[0]?.id, 'model');
    assert.ok(merged.catalog[0]?.choices.some(choice => choice.id === 'opus'));
  });

  it('preserves valid defaults on later refresh', () => {
    const previous: ProviderConfigStored = {
      catalog: [{ choices: [{ id: 'sonnet', name: 'sonnet' }], id: 'model', name: 'Model' }],
      defaults: { mode: 'plan', model: 'opus' },
    };
    const merged = mergeProviderConfigRefresh(previous, [
      modelOption('sonnet', ['sonnet', 'opus', 'haiku']),
      modeOption('default', ['default', 'plan']),
    ]);
    assert.deepStrictEqual(merged.defaults, { mode: 'plan', model: 'opus' });
    assert.ok(merged.catalog[0]?.choices.some(choice => choice.id === 'haiku'));
  });

  it('falls back to agent currentValue when a default vanishes from choices', () => {
    const previous: ProviderConfigStored = {
      catalog: [{ choices: [{ id: 'old-model', name: 'old' }], id: 'model', name: 'Model' }],
      defaults: { model: 'old-model' },
    };
    const merged = mergeProviderConfigRefresh(previous, [modelOption('sonnet', ['sonnet', 'opus'])]);
    assert.deepStrictEqual(merged.defaults, { model: 'sonnet' });
  });

  it('seeds new option ids with currentValue while keeping other defaults', () => {
    const previous: ProviderConfigStored = {
      catalog: [{ choices: [{ id: 'sonnet', name: 'sonnet' }], id: 'model', name: 'Model' }],
      defaults: { model: 'sonnet' },
    };
    const merged = mergeProviderConfigRefresh(previous, [
      modelOption('sonnet', ['sonnet', 'opus']),
      modeOption('plan', ['default', 'plan']),
    ]);
    assert.deepStrictEqual(merged.defaults, { mode: 'plan', model: 'sonnet' });
  });

  it('drops defaults for options removed from the catalog', () => {
    const previous: ProviderConfigStored = {
      catalog: [
        { choices: [{ id: 'sonnet', name: 'sonnet' }], id: 'model', name: 'Model' },
        { choices: [{ id: 'plan', name: 'plan' }], id: 'mode', name: 'Mode' },
      ],
      defaults: { mode: 'plan', model: 'sonnet' },
    };
    const merged = mergeProviderConfigRefresh(previous, [modelOption('opus', ['sonnet', 'opus'])]);
    assert.deepStrictEqual(merged.defaults, { model: 'sonnet' });
    assert.strictEqual(merged.catalog.length, 1);
  });
});

describe('refreshProviderConfigInMemory', () => {
  it('seeds then preserves across second activation with settings defaults', () => {
    const first = refreshProviderConfigInMemory(
      undefined,
      {},
      {
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
    );
    assert.deepStrictEqual(first?.defaults, { model: 'sonnet' });

    const afterEdit: ProviderConfigStored = {
      catalog: first?.catalog ?? [],
      defaults: { model: 'opus' },
    };
    const second = refreshProviderConfigInMemory(
      afterEdit,
      { model: 'opus' },
      {
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
    );
    assert.deepStrictEqual(second?.defaults, { model: 'opus' });
    const hasHaiku = second?.catalog[0]?.choices.some(choice => choice.id === 'haiku') ?? false;
    assert.isTrue(hasHaiku);
  });

  it('skips empty selectable without wiping previous', () => {
    const previous: ProviderConfigStored = {
      catalog: [{ choices: [{ id: 'x', name: 'X' }], id: 'model', name: 'Model' }],
      defaults: { model: 'x' },
    };
    const result = refreshProviderConfigInMemory(previous, { model: 'x' }, { configOptions: [] });
    assert.deepStrictEqual(result, previous);
  });
});

describe('defaultsEqual', () => {
  it('compares key/value maps', () => {
    assert.isTrue(defaultsEqual({ a: '1' }, { a: '1' }));
    assert.isFalse(defaultsEqual({ a: '1' }, { a: '2' }));
    assert.isFalse(defaultsEqual({ a: '1' }, { a: '1', b: '2' }));
  });
});

describe('harnessDefaultDiffs', () => {
  it('returns only defaults that differ from session currentValue and remain valid', () => {
    const diffs = harnessDefaultDiffs(
      {
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
          {
            currentValue: 'default',
            id: 'mode',
            name: 'Mode',
            options: [
              { name: 'Default', value: 'default' },
              { name: 'Plan', value: 'plan' },
            ],
            type: 'select',
          },
        ],
      },
      { mode: 'plan', model: 'sonnet', unknown: 'x' },
    );
    assert.deepStrictEqual(diffs, [{ configId: 'mode', value: 'plan' }]);
  });

  it('skips defaults whose value is no longer in choices', () => {
    const diffs = harnessDefaultDiffs(
      {
        configOptions: [
          {
            currentValue: 'sonnet',
            id: 'model',
            name: 'Model',
            options: [{ name: 'Sonnet', value: 'sonnet' }],
            type: 'select',
          },
        ],
      },
      { model: 'opus' },
    );
    assert.deepStrictEqual(diffs, []);
  });
});
