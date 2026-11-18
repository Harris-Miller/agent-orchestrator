import { assert, describe, it } from '@effect/vitest';

import type { NormalizedConfigOption, NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';

import { chipSuffixParts, modelRowsFor, pickerViewModel, searchModelRows, splitModelRows } from './modelPickerList.ts';

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
    assert.deepStrictEqual(chipSuffixParts('codex-acp', [fast, plan], effort), ['High', 'Fast', 'Plan']);
  });

  it('shows an ultra effort by its own name', () => {
    assert.deepStrictEqual(chipSuffixParts('codex-acp', [], { ...effort, currentValue: 'ultra' }), ['ultra']);
  });

  it('does not show Plan for a Claude option named collaboration_mode', () => {
    assert.deepStrictEqual(chipSuffixParts('claude-agent-acp', [plan], effort), ['High']);
  });

  it('adds Ultracode when the boolean option is on', () => {
    const ultracode: NormalizedConfigOption = { currentValue: true, id: 'ultracode', name: 'u', type: 'boolean' };
    assert.deepStrictEqual(chipSuffixParts('claude-agent-acp', [ultracode], effort), ['High', 'Ultracode']);
  });
});

describe('pickerViewModel', () => {
  const model: NormalizedSelectConfigOption = {
    choices,
    currentValue: 'm1',
    id: 'model',
    name: 'Model',
    type: 'select',
  };
  const input = { effort: undefined, model, options: [], prefs: { hidden: [], order: [] }, unavailableModelIds: [] };
  const emptySelect: NormalizedConfigOption = {
    choices: [],
    currentValue: undefined,
    id: 'empty',
    name: 'Empty',
    type: 'select',
  };
  const ultracodeOption: NormalizedConfigOption = {
    currentValue: false,
    id: 'ultracode',
    name: 'u',
    type: 'boolean',
  };

  it('drops selects with no choices and the Ultracode option from optionRows', () => {
    const view = pickerViewModel('claude-agent-acp', { ...input, options: [ultracodeOption, emptySelect] });
    assert.isFalse(view.optionRows.some(row => row.kind === 'option' && row.option.id === 'empty'));
    assert.isFalse(view.optionRows.some(row => row.kind === 'option' && row.option.id === 'ultracode'));
    assert.strictEqual(view.ultracode?.label, 'Ultracode');
  });

  it('sizes the pane taller for a select row than a switch row', () => {
    const select: NormalizedConfigOption = {
      choices: [{ id: 'a', name: 'A' }],
      currentValue: 'a',
      id: 'sel',
      name: 'Sel',
      type: 'select',
    };
    const flag: NormalizedConfigOption = { currentValue: false, id: 'flag', name: 'Flag', type: 'boolean' };
    const withSelect = pickerViewModel(undefined, { ...input, options: [select] });
    const withSwitch = pickerViewModel(undefined, { ...input, options: [flag] });
    assert.isAbove(withSelect.paneHeight, withSwitch.paneHeight);
  });

  it('exposes model rows, reasoning choices and the chip suffix', () => {
    const effort: NormalizedSelectConfigOption = {
      choices: [{ id: 'high', name: 'High' }],
      currentValue: 'high',
      id: 'effort',
      name: 'Effort',
      type: 'select',
    };
    const view = pickerViewModel('codex-acp', { ...input, effort });
    assert.lengthOf(view.rows, 3);
    assert.lengthOf(view.reasoning, 1);
    assert.deepStrictEqual(view.suffix, ['High']);
  });
});
