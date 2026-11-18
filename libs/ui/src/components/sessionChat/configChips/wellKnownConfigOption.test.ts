import { assert, describe, it } from '@effect/vitest';

import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';

import {
  isFastOption,
  isPlanOn,
  isWellKnownOption,
  optionControlKind,
  optionRowLabel,
  planToggleDiff,
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
  it('maps well-known options by launch target and id', () => {
    assert.strictEqual(optionControlKind('claude-agent-acp', select('agent')), 'agent-select');
    assert.strictEqual(optionControlKind('claude-agent-acp', bool('fast')), 'toggle');
    assert.strictEqual(optionControlKind('codex-acp', bool('fast-mode')), 'toggle');
    assert.strictEqual(optionControlKind('codex-acp', select('collaboration_mode')), 'plan-toggle');
  });

  it('does not apply a well-known mapping to another launch target', () => {
    assert.strictEqual(optionControlKind('codex-acp', select('agent')), 'select');
    assert.strictEqual(optionControlKind('claude-agent-acp', select('collaboration_mode')), 'select');
    assert.isFalse(isFastOption('claude-agent-acp', 'fast-mode'));
    assert.isTrue(isFastOption('claude-agent-acp', 'fast'));
  });

  it('falls back to a generic control by type', () => {
    assert.strictEqual(optionControlKind('cursor-acp', select('x')), 'select');
    assert.strictEqual(optionControlKind('cursor-acp', bool('x')), 'toggle');
    assert.isFalse(isWellKnownOption('cursor-acp', bool('x')));
    assert.isTrue(isWellKnownOption('codex-acp', bool('fast-mode')));
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
  });
});
