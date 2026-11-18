import { assert, describe, it } from '@effect/vitest';

import type { NormalizedConfigOption, NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';

import { chipSuffixParts, modelRowsFor, searchModelRows, splitModelRows } from './modelPickerList.ts';

const choices = ['m1', 'm2', 'm3'].map(id => ({ description: `${id} d`, id, name: id.toUpperCase() }));
const rows = (
  hidden: readonly string[],
  currentId = 'm1',
  order: readonly string[] = [],
  unavailableIds: string[] = [],
) => modelRowsFor(choices, { currentId, hidden, launchTarget: 'codex-acp', order, unavailableIds });

describe('modelRowsFor', () => {
  it('flags Hidden models and keeps Model order', () => {
    const result = rows(['m2'], 'm1', ['m3']);
    assert.deepStrictEqual(
      result.map(row => [row.id, row.hidden]),
      [
        ['m3', false],
        ['m1', false],
        ['m2', true],
      ],
    );
  });

  it('never hides the current model', () => {
    assert.isFalse(rows(['m1', 'm2'], 'm1')[0].hidden);
    assert.isTrue(rows(['m1', 'm2'], 'm3')[0].hidden);
  });

  it('ignores hiding when every model is hidden', () => {
    assert.isFalse(rows(['m1', 'm2', 'm3'], 'm2').some(row => row.hidden));
  });

  it('marks Unavailable models disabled with a label suffix', () => {
    const row = rows([], 'm1', [], ['m2']).find(r => r.id === 'm2');
    assert.strictEqual(row?.label, 'M2 (unavailable)');
    assert.isTrue(row?.disabled);
  });
});

describe('splitModelRows / searchModelRows', () => {
  it('splits shown and hidden', () => {
    const split = splitModelRows(rows(['m2', 'm3']));
    assert.deepStrictEqual(
      split.shown.map(row => row.id),
      ['m1'],
    );
    assert.strictEqual(split.hidden.length, 2);
  });

  it('search matches hidden and unhidden, unhidden first', () => {
    const hits = searchModelRows(rows(['m1', 'm2'], 'm3'), 'M');
    assert.deepStrictEqual(
      hits.map(row => row.id),
      ['m3', 'm1', 'm2'],
    );
    assert.deepStrictEqual(searchModelRows(rows([]), 'zzz'), []);
  });
});

describe('chipSuffixParts', () => {
  const effort: NormalizedSelectConfigOption = {
    choices: [
      { id: 'high', name: 'High' },
      { id: 'ultra', name: 'ultra' },
    ],
    currentValue: 'high',
    id: 'reasoning_effort',
    name: 'Reasoning',
    type: 'select',
  };
  const fast: NormalizedConfigOption = { currentValue: true, id: 'fast-mode', name: 'Fast', type: 'boolean' };
  const plan: NormalizedConfigOption = {
    choices: [],
    currentValue: 'plan',
    id: 'collaboration_mode',
    name: 'Collab',
    type: 'select',
  };

  it('lists effort, Fast and Plan', () => {
    assert.deepStrictEqual(chipSuffixParts('codex-acp', [fast, plan], effort, 'Ultra'), ['High', 'Fast', 'Plan']);
  });

  it('replaces effort with the Ultra label when ultra effort is on', () => {
    assert.deepStrictEqual(chipSuffixParts('codex-acp', [], { ...effort, currentValue: 'ultra' }, 'Ultra'), ['Ultra']);
  });

  it('adds Ultracode when the boolean option is on', () => {
    const ultracode: NormalizedConfigOption = { currentValue: true, id: 'ultracode', name: 'u', type: 'boolean' };
    assert.deepStrictEqual(chipSuffixParts('claude-agent-acp', [ultracode], effort, 'Ultracode'), [
      'High',
      'Ultracode',
    ]);
  });
});
