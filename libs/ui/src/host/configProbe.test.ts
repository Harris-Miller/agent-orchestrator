import { assert, describe, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { layerNoop } from 'effect/FileSystem';

import type { ConfigOptionIndex } from './configProbe.ts';
import type { NormalizedBooleanConfigOption, NormalizedSelectConfigOption } from './acpSessionBootstrap.ts';
import {
  configOptionIndexFromProbeResponses,
  configOptionIndexIsNonempty,
  configValuesFromOptions,
  mergeConfigOptionIndex,
  preserveConfigValuesOnModelChange,
  runConfigProbe,
} from './configProbe.ts';

const selectOption = (id: string, currentValue: string, choices: readonly string[]): NormalizedSelectConfigOption => ({
  choices: choices.map(choice => ({ id: choice, name: choice })),
  currentValue,
  id,
  name: id,
  type: 'select',
});

const booleanOption = (id: string, currentValue: boolean): NormalizedBooleanConfigOption => ({
  currentValue,
  id,
  name: id,
  type: 'boolean',
});

const probeServices = layerNoop({
  makeTempDirectory: () => Effect.succeed('/tmp/ao-config-probe-test'),
  remove: () => Effect.void,
});

describe('configOptionIndexFromProbeResponses', () => {
  it('stores each model response as-is without cross-model merge', () => {
    const index = configOptionIndexFromProbeResponses('sonnet', {
      opus: {
        configOptions: [
          {
            currentValue: 'opus',
            id: 'model',
            name: 'Model',
            options: [{ name: 'Opus', value: 'opus' }],
            type: 'select',
          },
          {
            currentValue: 'max',
            id: 'effort',
            name: 'Effort',
            options: [{ name: 'Max', value: 'max' }],
            type: 'select',
          },
        ],
      },
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
          {
            currentValue: 'default',
            id: 'mode',
            name: 'Mode',
            options: [{ name: 'Default', value: 'default' }],
            type: 'select',
          },
          {
            currentValue: false,
            id: 'fast-mode',
            name: 'Fast mode',
            type: 'boolean',
          },
        ],
      },
    });

    assert.strictEqual(index.defaultModelId, 'sonnet');
    assert.deepStrictEqual(
      index.byModel.sonnet.map(option => option.id),
      ['model', 'mode', 'fast-mode'],
    );
    assert.deepStrictEqual(
      index.byModel.opus.map(option => option.id),
      ['model', 'effort'],
    );
    assert.deepStrictEqual(index.unavailableModelIds, []);
  });
});

const modelOption = (current: string, ids: readonly string[]) => ({
  currentValue: current,
  id: 'model',
  name: 'Model',
  options: ids.map(id => ({ name: id, value: id })),
  type: 'select',
});

const effortOption = (current: string) => ({
  currentValue: current,
  id: 'effort',
  name: 'Effort',
  options: [
    { name: 'Low', value: 'low' },
    { name: 'High', value: 'high' },
  ],
  type: 'select',
});

const rowIds = (index: ConfigOptionIndex | undefined, modelId: string) =>
  index?.byModel[modelId]?.map(option => option.id);

describe('mergeConfigOptionIndex', () => {
  it('session/new seeds default row and model list from nothing', () => {
    const index = mergeConfigOptionIndex(undefined, {
      _tag: 'SessionNew',
      response: { configOptions: [modelOption('sonnet', ['sonnet', 'opus'])] },
    });
    assert.strictEqual(index?.defaultModelId, 'sonnet');
    assert.deepStrictEqual(Object.keys(index?.byModel ?? {}), ['sonnet']);
    assert.deepStrictEqual(index?.unavailableModelIds, []);
  });

  it('session/new replaces default row, keeps other rows, drops unadvertised models', () => {
    const prev = mergeConfigOptionIndex(
      mergeConfigOptionIndex(undefined, {
        _tag: 'SessionNew',
        response: { configOptions: [modelOption('sonnet', ['sonnet', 'opus', 'old'])] },
      }),
      {
        _tag: 'ModelPicked',
        modelId: 'opus',
        response: { configOptions: [modelOption('opus', ['sonnet', 'opus', 'old']), effortOption('high')] },
      },
    );
    const old = mergeConfigOptionIndex(prev, {
      _tag: 'ModelPicked',
      modelId: 'old',
      response: { configOptions: [modelOption('old', ['sonnet', 'opus', 'old'])] },
    });
    const next = mergeConfigOptionIndex(old, {
      _tag: 'SessionNew',
      response: { configOptions: [modelOption('haiku', ['haiku', 'sonnet', 'opus']), effortOption('low')] },
    });
    assert.strictEqual(next?.defaultModelId, 'haiku');
    assert.deepStrictEqual(rowIds(next, 'haiku'), ['model', 'effort']);
    assert.deepStrictEqual(rowIds(next, 'opus'), ['model', 'effort']);
    assert.isUndefined(next?.byModel.old);
    assert.deepStrictEqual(rowIds(next, 'sonnet'), ['model']);
  });

  it('session/new without a model currentValue leaves the index unchanged', () => {
    const prev = mergeConfigOptionIndex(undefined, {
      _tag: 'SessionNew',
      response: { configOptions: [modelOption('sonnet', ['sonnet'])] },
    });
    assert.strictEqual(mergeConfigOptionIndex(prev, { _tag: 'SessionNew', response: { configOptions: [] } }), prev);
  });

  it('model pick stores that model row and clears unavailable; failed pick marks it unavailable and drops its row', () => {
    const seeded = mergeConfigOptionIndex(undefined, {
      _tag: 'SessionNew',
      response: { configOptions: [modelOption('sonnet', ['sonnet', 'opus'])] },
    });
    const failed = mergeConfigOptionIndex(seeded, { _tag: 'ModelPickFailed', modelId: 'opus' });
    assert.deepStrictEqual(failed?.unavailableModelIds, ['opus']);
    assert.isUndefined(failed?.byModel.opus);
    const again = mergeConfigOptionIndex(failed, { _tag: 'ModelPickFailed', modelId: 'opus' });
    assert.deepStrictEqual(again?.unavailableModelIds, ['opus']);
    const ok = mergeConfigOptionIndex(failed, {
      _tag: 'ModelPicked',
      modelId: 'opus',
      response: { configOptions: [modelOption('opus', ['sonnet', 'opus']), effortOption('high')] },
    });
    assert.deepStrictEqual(ok?.unavailableModelIds, []);
    assert.deepStrictEqual(rowIds(ok, 'opus'), ['model', 'effort']);
  });

  it('model events without an index are ignored', () => {
    assert.isUndefined(mergeConfigOptionIndex(undefined, { _tag: 'ModelPickFailed', modelId: 'x' }));
    assert.isUndefined(mergeConfigOptionIndex(undefined, { _tag: 'ModelPicked', modelId: 'x', response: {} }));
  });
});

describe('preserveConfigValuesOnModelChange', () => {
  it('keeps valid picks, resets missing/invalid to currentValue, drops absent ids', () => {
    const next = preserveConfigValuesOnModelChange({ effort: 'stale', gone: 'x', mode: 'plan', model: 'opus' }, [
      selectOption('model', 'opus', ['sonnet', 'opus']),
      selectOption('mode', 'default', ['default', 'plan']),
      selectOption('effort', 'low', ['low', 'high']),
    ]);
    assert.deepStrictEqual(next, { effort: 'low', mode: 'plan', model: 'opus' });
  });

  it('preserves boolean picks across model change when option remains', () => {
    const next = preserveConfigValuesOnModelChange({ 'fast-mode': true, model: 'opus' }, [
      selectOption('model', 'opus', ['sonnet', 'opus']),
      booleanOption('fast-mode', false),
    ]);
    assert.deepStrictEqual(next, { 'fast-mode': true, model: 'opus' });
  });
});

describe('configValuesFromOptions / nonempty', () => {
  it('maps currentValues and reports nonempty index', () => {
    const options = [selectOption('model', 'sonnet', ['sonnet']), booleanOption('fast-mode', false)];
    assert.deepStrictEqual(configValuesFromOptions(options), { 'fast-mode': false, model: 'sonnet' });
    assert.isTrue(
      configOptionIndexIsNonempty({
        byModel: { sonnet: options },
        defaultModelId: 'sonnet',
        unavailableModelIds: [],
      }),
    );
    assert.isFalse(configOptionIndexIsNonempty(undefined));
    assert.isFalse(configOptionIndexIsNonempty({ byModel: {}, defaultModelId: 'x', unavailableModelIds: [] }));
  });
});

describe('runConfigProbe', () => {
  const makeAgent = (calls: string[], response: unknown, closeFails = false) => ({
    'session/close': () => {
      calls.push('close');
      return closeFails ? Effect.fail('close-failed') : Effect.void;
    },
    'session/delete': () => {
      calls.push('delete');
      return closeFails ? Effect.fail('delete-failed') : Effect.void;
    },
    'session/new': () => {
      calls.push('new');
      return Effect.succeed({ sessionId: 'probe-1', ...(response as object) });
    },
  });

  it.effect('seeds model list and default row from one session/new; close/delete failure still returns index', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const agent = makeAgent(
        calls,
        { configOptions: [modelOption('sonnet', ['sonnet', 'opus']), effortOption('high')] },
        true,
      );

      const index = yield* runConfigProbe(agent);
      assert.strictEqual(index.defaultModelId, 'sonnet');
      assert.deepStrictEqual(Object.keys(index.byModel), ['sonnet']);
      assert.deepStrictEqual(rowIds(index, 'sonnet'), ['model', 'effort']);
      assert.deepStrictEqual(index.unavailableModelIds, []);
      assert.deepStrictEqual(calls, ['new', 'close', 'delete']);
    }).pipe(Effect.provide(probeServices)),
  );

  it.effect('fails when session/new has no model currentValue; still cleans up', () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const agent = makeAgent(calls, { configOptions: [{ id: 'mode', name: 'Mode', type: 'select' }] });
      const exit = yield* Effect.exit(runConfigProbe(agent));
      assert.isTrue(Exit.isFailure(exit));
      assert.deepStrictEqual(calls, ['new', 'close', 'delete']);
    }).pipe(Effect.provide(probeServices)),
  );
});
