import { assert, describe, it } from '@effect/vitest';

import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';

import {
  isFastOption,
  isPlanOn,
  isPlanOption,
  optionRowLabel,
  planToggleDiff,
  toggleSuffixParts,
} from './wellKnownConfigOption.ts';

const select = (id: string, currentValue = 'default'): NormalizedConfigOption => ({
  choices: [{ id: 'default', name: 'Default' }],
  currentValue,
  id,
  name: id,
  type: 'select',
});
const bool = (id: string): NormalizedConfigOption => ({ currentValue: false, id, name: id, type: 'boolean' });

describe('wellKnownConfigOption', () => {
  it('recognises Fast and Plan options per launch target', () => {
    assert.isTrue(isFastOption('claude-agent-acp', bool('fast')));
    assert.isTrue(isFastOption('codex-acp', bool('fast-mode')));
    assert.isFalse(isFastOption('claude-agent-acp', bool('fast-mode')));
    assert.isFalse(isFastOption('claude-agent-acp', select('fast')));
    assert.isTrue(isPlanOption('codex-acp', select('collaboration_mode')));
    assert.isFalse(isPlanOption('claude-agent-acp', select('collaboration_mode')));
    assert.isFalse(isPlanOption('cursor-acp', select('collaboration_mode')));
  });

  it('maps the Plan toggle to plan/default', () => {
    const option = select('collaboration_mode', 'plan');
    assert.isTrue(isPlanOn(option));
    assert.deepStrictEqual(planToggleDiff(option, false), {
      configId: 'collaboration_mode',
      type: 'select',
      value: 'default',
    });
    assert.deepStrictEqual(planToggleDiff(option, true).value, 'plan');
    assert.strictEqual(optionRowLabel('codex-acp', option), 'Plan');
    assert.strictEqual(optionRowLabel('claude-agent-acp', option), 'collaboration_mode');
  });

  it('suffixes Fast / Plan only for the provider that owns the option', () => {
    const fastOn: NormalizedConfigOption = { currentValue: true, id: 'fast-mode', name: 'fast-mode', type: 'boolean' };
    const planOn = select('collaboration_mode', 'plan');
    assert.deepStrictEqual(toggleSuffixParts('codex-acp', [fastOn, planOn]), ['Fast', 'Plan']);
    assert.deepStrictEqual(toggleSuffixParts('claude-agent-acp', [fastOn, planOn]), []);
  });
});
