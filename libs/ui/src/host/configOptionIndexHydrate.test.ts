import { assert, describe, it } from '@effect/vitest';

import { effortOption, modelSelectOption, rowIds } from './configOptionIndexFixtures.ts';
import { mergeConfigOptionIndex } from './configOptionIndexHydrate.ts';

describe('mergeConfigOptionIndex', () => {
  it('session/new seeds default row and model list from nothing', () => {
    const index = mergeConfigOptionIndex(undefined, {
      _tag: 'SessionNew',
      response: { configOptions: [modelSelectOption('sonnet', ['sonnet', 'opus'])] },
    });
    assert.strictEqual(index?.defaultModelId, 'sonnet');
    assert.deepStrictEqual(Object.keys(index?.byModel ?? {}), ['sonnet']);
    assert.deepStrictEqual(index?.unavailableModelIds, []);
  });

  it('session/new replaces default row, keeps other rows, drops unadvertised models', () => {
    const prev = mergeConfigOptionIndex(
      mergeConfigOptionIndex(undefined, {
        _tag: 'SessionNew',
        response: { configOptions: [modelSelectOption('sonnet', ['sonnet', 'opus', 'old'])] },
      }),
      {
        _tag: 'ModelPicked',
        modelId: 'opus',
        response: { configOptions: [modelSelectOption('opus', ['sonnet', 'opus', 'old']), effortOption('high')] },
      },
    );
    const old = mergeConfigOptionIndex(prev, {
      _tag: 'ModelPicked',
      modelId: 'old',
      response: { configOptions: [modelSelectOption('old', ['sonnet', 'opus', 'old'])] },
    });
    const next = mergeConfigOptionIndex(old, {
      _tag: 'SessionNew',
      response: { configOptions: [modelSelectOption('haiku', ['haiku', 'sonnet', 'opus']), effortOption('low')] },
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
      response: { configOptions: [modelSelectOption('sonnet', ['sonnet'])] },
    });
    assert.strictEqual(mergeConfigOptionIndex(prev, { _tag: 'SessionNew', response: { configOptions: [] } }), prev);
  });

  it('model pick stores that model row and clears unavailable; failed pick marks it unavailable and drops its row', () => {
    const seeded = mergeConfigOptionIndex(undefined, {
      _tag: 'SessionNew',
      response: { configOptions: [modelSelectOption('sonnet', ['sonnet', 'opus'])] },
    });
    const failed = mergeConfigOptionIndex(seeded, { _tag: 'ModelPickFailed', modelId: 'opus' });
    assert.deepStrictEqual(failed?.unavailableModelIds, ['opus']);
    assert.isUndefined(failed?.byModel.opus);
    const again = mergeConfigOptionIndex(failed, { _tag: 'ModelPickFailed', modelId: 'opus' });
    assert.deepStrictEqual(again?.unavailableModelIds, ['opus']);
    const ok = mergeConfigOptionIndex(failed, {
      _tag: 'ModelPicked',
      modelId: 'opus',
      response: { configOptions: [modelSelectOption('opus', ['sonnet', 'opus']), effortOption('high')] },
    });
    assert.deepStrictEqual(ok?.unavailableModelIds, []);
    assert.deepStrictEqual(rowIds(ok, 'opus'), ['model', 'effort']);
  });

  it('model events without an index are ignored', () => {
    assert.isUndefined(mergeConfigOptionIndex(undefined, { _tag: 'ModelPickFailed', modelId: 'x' }));
    assert.isUndefined(mergeConfigOptionIndex(undefined, { _tag: 'ModelPicked', modelId: 'x', response: {} }));
  });
});
