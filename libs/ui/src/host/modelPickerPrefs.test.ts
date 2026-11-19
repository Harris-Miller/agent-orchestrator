import { assert, describe, it } from 'vitest';

import {
  arrangeModelChoices,
  orderedModelIds,
  pruneHidden,
  reorderModels,
  setAllModelsHidden,
  setModelHidden,
  withNewModelsFirst,
} from './modelPickerPrefs.ts';

const choices = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id.toUpperCase() }));
const ids = (list: readonly { readonly id: string }[]) => list.map(choice => choice.id);

describe('arrangeModelChoices', () => {
  it('keeps agent order with no prefs', () => {
    assert.deepStrictEqual(ids(arrangeModelChoices(choices, { currentId: 'a', hidden: [], order: [] })), [
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('puts a partial order first and appends the rest in agent order', () => {
    assert.deepStrictEqual(ids(arrangeModelChoices(choices, { currentId: 'a', hidden: [], order: ['c', 'b'] })), [
      'c',
      'b',
      'a',
      'd',
    ]);
  });

  it('ignores stale ids', () => {
    assert.deepStrictEqual(
      ids(arrangeModelChoices(choices, { currentId: 'a', hidden: ['gone'], order: ['gone', 'd'] })),
      ['d', 'a', 'b', 'c'],
    );
  });

  it('drops hidden models but keeps the hidden current model in its slot', () => {
    assert.deepStrictEqual(
      ids(arrangeModelChoices(choices, { currentId: 'b', hidden: ['a', 'b'], order: ['c', 'b'] })),
      ['c', 'b', 'd'],
    );
  });

  it('ignores hiding when everything is hidden', () => {
    assert.deepStrictEqual(
      ids(arrangeModelChoices(choices, { currentId: 'c', hidden: ['a', 'b', 'c', 'd'], order: ['d'] })),
      ['d', 'a', 'b', 'c'],
    );
  });
});

describe('arrangeModelChoices with Unavailable models', () => {
  it('ignores hiding when every other model is hidden and the rest are Unavailable', () => {
    assert.deepStrictEqual(
      ids(arrangeModelChoices(choices, { currentId: 'd', hidden: ['a', 'b'], order: [], unavailableIds: ['c', 'd'] })),
      ['a', 'b', 'c', 'd'],
    );
  });
});

describe('prefs updates', () => {
  const all = ['a', 'b', 'c', 'd'];

  it('reorders into the target slot and keeps unadvertised ids last', () => {
    assert.deepStrictEqual(reorderModels(all, ['gone', 'a'], 'd', 'a'), ['d', 'a', 'b', 'c', 'gone']);
    assert.deepStrictEqual(reorderModels(all, [], 'a', 'c'), ['b', 'c', 'a', 'd']);
    assert.deepStrictEqual(reorderModels(all, [], 'a', 'nope'), all);
  });

  it('hidden models keep their slot in the order', () => {
    assert.deepStrictEqual(orderedModelIds(all, ['c', 'a']), ['c', 'a', 'b', 'd']);
  });

  it('toggles hidden, keeping unadvertised ids; pruneHidden filters at render', () => {
    assert.deepStrictEqual(setModelHidden(['gone', 'b'], 'c', true), ['gone', 'b', 'c']);
    assert.deepStrictEqual(setModelHidden(['b', 'c'], 'b', false), ['c']);
    assert.deepStrictEqual(pruneHidden(all, ['x', 'd']), ['d']);
  });

  it('sets all hidden / none hidden', () => {
    assert.deepStrictEqual(setAllModelsHidden(all, ['gone'], true), ['gone', ...all]);
    assert.deepStrictEqual(setAllModelsHidden(all, ['gone', 'a'], false), ['gone']);
  });
});

describe('withNewModelsFirst', () => {
  it('puts new ids first in order and un-hides them', () => {
    assert.deepStrictEqual(withNewModelsFirst({ hidden: ['n1', 'x'], order: ['a', 'n2'] }, ['n1', 'n2']), {
      hidden: ['x'],
      order: ['n1', 'n2', 'a'],
    });
  });

  it('is a no-op for no new ids', () => {
    const prefs = { hidden: ['x'], order: ['a'] };
    assert.strictEqual(withNewModelsFirst(prefs, []), prefs);
  });
});
