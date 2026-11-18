import { assert, describe, it } from '@effect/vitest';

import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';

import { reasoningChoices, ultraRow, ultraToggleDiffs } from './ultra.ts';

const effort = (currentValue: string, choices: readonly string[]): NormalizedConfigOption => ({
  choices: choices.map(id => ({ id, name: id })),
  currentValue,
  id: 'reasoning_effort',
  name: 'Reasoning',
  type: 'select',
});

describe('ultra', () => {
  it('enables Codex Ultra iff the effort choices include ultra', () => {
    assert.isUndefined(ultraRow('codex-acp', [effort('low', ['low', 'ultra'])])?.disabledReason);
    assert.isDefined(ultraRow('codex-acp', [effort('low', ['low', 'high'])])?.disabledReason);
    assert.isTrue(ultraRow('codex-acp', [effort('ultra', ['low', 'ultra'])])?.on);
    assert.strictEqual(ultraRow('codex-acp', [])?.label, 'Ultra');
  });

  it('Claude Ultracode is disabled unless a boolean ultracode option is advertised', () => {
    assert.strictEqual(
      ultraRow('claude-agent-acp', [effort('low', ['low'])])?.disabledReason,
      'Not advertised by this provider',
    );
    const row = ultraRow('claude-agent-acp', [{ currentValue: true, id: 'ultracode', name: 'x', type: 'boolean' }]);
    assert.deepStrictEqual(row, { disabledReason: undefined, kind: 'option', label: 'Ultracode', on: true });
  });

  it('shows no row for providers without an Ultra concept', () => {
    assert.isUndefined(ultraRow('cursor-acp', [effort('low', ['low'])]));
  });

  it('removes ultra from the Reasoning choices', () => {
    const option = effort('low', ['low', 'ultra']);
    assert.deepStrictEqual(option.type === 'select' ? reasoningChoices(option).map(choice => choice.id) : [], ['low']);
  });

  it('toggles effort-based Ultra and restores the previous effort', () => {
    const options = [effort('high', ['low', 'high', 'ultra'])];
    assert.deepStrictEqual(ultraToggleDiffs(options, true, 'high'), [
      { configId: 'reasoning_effort', type: 'select', value: 'ultra' },
    ]);
    assert.deepStrictEqual(ultraToggleDiffs(options, false, 'high'), [
      { configId: 'reasoning_effort', type: 'select', value: 'high' },
    ]);
    assert.deepStrictEqual(ultraToggleDiffs(options, false, undefined), [
      { configId: 'reasoning_effort', type: 'select', value: 'low' },
    ]);
  });

  it('toggles a boolean ultracode option directly', () => {
    assert.deepStrictEqual(
      ultraToggleDiffs([{ currentValue: false, id: 'ultracode', name: 'x', type: 'boolean' }], true, undefined),
      [{ configId: 'ultracode', type: 'boolean', value: true }],
    );
  });
});
