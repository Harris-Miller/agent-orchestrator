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

  it('characterization: ModelPicked stores the row under the requested modelId even if the response reports another currentValue', () => {
    const seeded = mergeConfigOptionIndex(undefined, {
      _tag: 'SessionNew',
      response: { configOptions: [modelSelectOption('sonnet', ['sonnet', 'opus'])] },
    });
    const next = mergeConfigOptionIndex(seeded, {
      _tag: 'ModelPicked',
      modelId: 'opus',
      response: { configOptions: [modelSelectOption('sonnet', ['sonnet', 'opus']), effortOption('high')] },
    });
    assert.deepStrictEqual(rowIds(next, 'opus'), ['model', 'effort']);
    assert.strictEqual(next?.byModel.opus?.[0]?.currentValue, 'sonnet');
  });

  const seededWith = (ids: readonly string[], unavailable: readonly string[] = []) => {
    const seeded = mergeConfigOptionIndex(undefined, {
      _tag: 'SessionNew',
      response: { configOptions: [modelSelectOption('sonnet', ids)] },
    });
    return seeded === undefined ? undefined : { ...seeded, unavailableModelIds: unavailable };
  };

  it('ModelPicked prunes rows and Unavailable marks of models no longer advertised', () => {
    const prev = seededWith(['sonnet', 'opus', 'old'], ['old']);
    const next = mergeConfigOptionIndex(prev && { ...prev, byModel: { ...prev.byModel, old: [] } }, {
      _tag: 'ModelPicked',
      modelId: 'opus',
      response: { configOptions: [modelSelectOption('opus', ['sonnet', 'opus', 'new']), effortOption('high')] },
    });
    assert.deepStrictEqual(Object.keys(next?.byModel ?? {}).sort(), ['opus', 'sonnet']);
    assert.deepStrictEqual(next?.unavailableModelIds, []);
    assert.strictEqual(next?.defaultModelId, 'sonnet');
    const choices = next?.byModel.sonnet?.[0];
    assert.deepStrictEqual(choices?.type === 'select' ? choices.choices.map(choice => choice.id) : [], [
      'sonnet',
      'opus',
      'new',
    ]);
  });

  it('ModelPicked moves the default to the picked model when the default is no longer advertised', () => {
    const next = mergeConfigOptionIndex(seededWith(['default', 'opus']), {
      _tag: 'ModelPicked',
      modelId: 'opus',
      response: { configOptions: [modelSelectOption('opus', ['opus', 'haiku']), effortOption('high')] },
    });
    assert.strictEqual(next?.defaultModelId, 'opus');
    assert.deepStrictEqual(Object.keys(next?.byModel ?? {}), ['opus']);
    assert.deepStrictEqual(rowIds(next, 'opus'), ['model', 'effort']);
  });

  it('ModelPicked without a model select leaves the advertised list alone', () => {
    const next = mergeConfigOptionIndex(seededWith(['sonnet', 'opus']), {
      _tag: 'ModelPicked',
      modelId: 'opus',
      response: { configOptions: [effortOption('high')] },
    });
    assert.deepStrictEqual(Object.keys(next?.byModel ?? {}).sort(), ['opus', 'sonnet']);
    assert.strictEqual(next?.defaultModelId, 'sonnet');
  });
});
