import { assert, describe, it } from '@effect/vitest';
import { beforeEach } from 'vitest';

import type { NormalizedConfigOption } from './acpSessionBootstrap.ts';
import {
  harnessDefaultDiffs,
  mergeProviderConfigRefresh,
  persistProviderConfig,
  readProviderConfig,
  refreshCatalogFromSessionState,
  saveHarnessDefaults,
} from './providerConfigStorage.ts';
import type { ProviderConfigStored } from './providerConfigStorage.ts';

const memoryStore = new Map<string, string>();

const memoryLocalStorage = {
  clear: () => {
    memoryStore.clear();
  },
  getItem: (key: string) => memoryStore.get(key) ?? null,
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value);
  },
};

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryLocalStorage });

beforeEach(() => {
  memoryStore.clear();
});

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

describe('providerConfigStorage persistence', () => {
  it('returns undefined when no key exists', () => {
    assert.strictEqual(readProviderConfig('codex-acp'), undefined);
  });

  it('round-trips stored config', () => {
    const stored: ProviderConfigStored = {
      catalog: [{ choices: [{ id: 'a', name: 'A' }], id: 'model', name: 'Model' }],
      defaults: { model: 'a' },
    };
    persistProviderConfig('codex-acp', stored);
    assert.deepStrictEqual(readProviderConfig('codex-acp'), stored);
  });

  it('returns undefined for corrupt JSON', () => {
    localStorage.setItem('acp-provider-config:codex-acp', '{not-json');
    assert.strictEqual(readProviderConfig('codex-acp'), undefined);
  });

  it('returns undefined for invalid shape', () => {
    localStorage.setItem('acp-provider-config:codex-acp', JSON.stringify({ catalog: 'nope' }));
    assert.strictEqual(readProviderConfig('codex-acp'), undefined);
  });

  it('refreshCatalogFromSessionState seeds then preserves across second activation', () => {
    const first = refreshCatalogFromSessionState('claude-agent-acp', {
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
    });
    assert.deepStrictEqual(first?.defaults, { model: 'sonnet' });

    saveHarnessDefaults('claude-agent-acp', { model: 'opus' });

    const second = refreshCatalogFromSessionState('claude-agent-acp', {
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
    });
    assert.deepStrictEqual(second?.defaults, { model: 'opus' });
    const hasHaiku = second?.catalog[0]?.choices.some(choice => choice.id === 'haiku') ?? false;
    assert.isTrue(hasHaiku);
  });

  it('refreshCatalogFromSessionState skips empty selectable without wiping storage', () => {
    persistProviderConfig('echo', {
      catalog: [{ choices: [{ id: 'x', name: 'X' }], id: 'model', name: 'Model' }],
      defaults: { model: 'x' },
    });
    const result = refreshCatalogFromSessionState('echo', { configOptions: [] });
    assert.deepStrictEqual(result?.defaults, { model: 'x' });
  });

  it('saveHarnessDefaults overwrites defaults without changing catalog', () => {
    persistProviderConfig('codex-acp', {
      catalog: [{ choices: [{ id: 'a', name: 'A' }], id: 'model', name: 'Model' }],
      defaults: { model: 'a' },
    });
    const saved = saveHarnessDefaults('codex-acp', { model: 'b' });
    assert.deepStrictEqual(saved.defaults, { model: 'b' });
    assert.strictEqual(saved.catalog[0]?.id, 'model');
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
