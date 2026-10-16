import { assert, describe, it } from '@effect/vitest';

import type { NormalizedBooleanConfigOption, NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';

import { isEffortConfigOptionId, partitionComposerConfigOptions } from './partitionComposerConfigOptions.ts';

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

describe('isEffortConfigOptionId', () => {
  it('matches effort and reasoning_effort only', () => {
    assert.isTrue(isEffortConfigOptionId('effort'));
    assert.isTrue(isEffortConfigOptionId('reasoning_effort'));
    assert.isFalse(isEffortConfigOptionId('model'));
    assert.isFalse(isEffortConfigOptionId('mode'));
  });
});

describe('partitionComposerConfigOptions', () => {
  it('groups model + effort when both present and peels mode', () => {
    const model = selectOption('model', 'sonnet', ['sonnet', 'opus']);
    const effort = selectOption('effort', 'high', ['low', 'high']);
    const mode = selectOption('mode', 'default', ['default', 'acceptEdits']);
    const fast = booleanOption('fast-mode', false);

    const partitioned = partitionComposerConfigOptions([mode, model, effort, fast]);

    assert.strictEqual(partitioned.mode, mode);
    assert.deepStrictEqual(partitioned.modelEffort, { effort, model });
    assert.deepStrictEqual(partitioned.leftovers, [fast]);
  });

  it('groups model + reasoning_effort', () => {
    const model = selectOption('model', 'gpt', ['gpt']);
    const effort = selectOption('reasoning_effort', 'medium', ['low', 'medium']);
    const partitioned = partitionComposerConfigOptions([model, effort]);

    assert.isUndefined(partitioned.mode);
    assert.deepStrictEqual(partitioned.modelEffort, { effort, model });
    assert.deepStrictEqual(partitioned.leftovers, []);
  });

  it('keeps model in modelEffort slot when effort missing', () => {
    const model = selectOption('model', 'sonnet', ['sonnet']);
    const mode = selectOption('mode', 'default', ['default']);
    const partitioned = partitionComposerConfigOptions([model, mode]);

    assert.strictEqual(partitioned.mode, mode);
    assert.deepStrictEqual(partitioned.modelEffort, { effort: undefined, model });
    assert.deepStrictEqual(partitioned.leftovers, []);
  });

  it('leaves effort alone in leftovers when model missing', () => {
    const effort = selectOption('effort', 'high', ['high']);
    const partitioned = partitionComposerConfigOptions([effort]);

    assert.isUndefined(partitioned.mode);
    assert.isUndefined(partitioned.modelEffort);
    assert.deepStrictEqual(partitioned.leftovers, [effort]);
  });

  it('ignores non-select mode/model/effort ids into leftovers', () => {
    const modeBool = booleanOption('mode', true);
    const partitioned = partitionComposerConfigOptions([modeBool]);

    assert.isUndefined(partitioned.mode);
    assert.isUndefined(partitioned.modelEffort);
    assert.deepStrictEqual(partitioned.leftovers, [modeBool]);
  });
});
