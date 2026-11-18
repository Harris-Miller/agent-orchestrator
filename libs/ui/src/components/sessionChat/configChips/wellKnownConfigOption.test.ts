import { assert, describe, it } from '@effect/vitest';

import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';

import {
  isFastOption,
  isPlanOn,
  isPlanOption,
  isPlanSwitch,
  optionRowLabel,
  optionRowsFor,
  planToggleDiff,
  toggleSuffixParts,
} from './wellKnownConfigOption.ts';

const select = (id: string, currentValue = 'default'): NormalizedConfigOption => ({
  choices: [
    { id: 'default', name: 'Default' },
    { id: 'plan', name: 'Plan' },
  ],
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

describe('always-shown options', () => {
  it('shows disabled placeholders for Plan and Fast when the session omits them', () => {
    assert.deepStrictEqual(optionRowsFor('codex-acp', []), [
      { kind: 'absent', label: 'Plan' },
      { kind: 'absent', label: 'Fast mode' },
    ]);
    assert.deepStrictEqual(optionRowsFor('claude-agent-acp', []), [{ kind: 'absent', label: 'Fast mode' }]);
    assert.deepStrictEqual(optionRowsFor('cursor-acp', []), []);
  });

  it('uses the reported options, Plan then Fast first, then the rest; Codex accepts fast_mode', () => {
    const other = bool('web');
    const fast = bool('fast_mode');
    const plan = select('collaboration_mode');
    assert.deepStrictEqual(optionRowsFor('codex-acp', [other, fast, plan]), [
      { kind: 'option', option: plan },
      { kind: 'option', option: fast },
      { kind: 'option', option: other },
    ]);
  });

  it('is a Plan switch only for exactly default|plan', () => {
    const three = {
      ...select('collaboration_mode'),
      choices: ['default', 'plan', 'review'].map(id => ({ id, name: id })),
    };
    assert.isTrue(isPlanSwitch('codex-acp', select('collaboration_mode')));
    assert.isFalse(isPlanSwitch('codex-acp', three));
    assert.strictEqual(optionRowLabel('codex-acp', three), 'collaboration_mode');
  });
});
