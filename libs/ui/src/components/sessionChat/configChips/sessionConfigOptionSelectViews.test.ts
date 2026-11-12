import { assert, describe, it } from '@effect/vitest';

import type { NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';

import {
  isModelChoiceUnavailable,
  modelSelectChoiceLabel,
  selectChoiceViews,
} from './sessionConfigOptionSelectViews.ts';

const selectOption = (id: string, currentValue: string, choices: readonly string[]): NormalizedSelectConfigOption => ({
  choices: choices.map(choice => ({ id: choice, name: choice })),
  currentValue,
  id,
  name: id,
  type: 'select',
});

describe('modelSelectChoiceLabel / isModelChoiceUnavailable / selectChoiceViews', () => {
  it('marks only model select choices listed as unavailable', () => {
    assert.isTrue(isModelChoiceUnavailable('model', 'opus', ['opus']));
    assert.isFalse(isModelChoiceUnavailable('model', 'sonnet', ['opus']));
    assert.isFalse(isModelChoiceUnavailable('mode', 'opus', ['opus']));
    assert.strictEqual(modelSelectChoiceLabel('Opus', true), 'Opus (unavailable)');
    assert.strictEqual(modelSelectChoiceLabel('Opus', false), 'Opus');
  });

  it('builds select choice views from Unavailable models', () => {
    const option = selectOption('model', 'sonnet', ['sonnet', 'opus']);
    assert.deepStrictEqual(selectChoiceViews(option, ['opus']), [
      { description: undefined, disabled: false, id: 'sonnet', label: 'sonnet' },
      { description: undefined, disabled: true, id: 'opus', label: 'opus (unavailable)' },
    ]);
  });
});
