import { assert, describe, it } from '@effect/vitest';

import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';

import { ultraRow, ultraSuffixParts, ultraToggleDiffs, withoutUltraOption } from './ultra.ts';

const ultracode = (currentValue: boolean): NormalizedConfigOption => ({
  currentValue,
  id: 'ultracode',
  name: 'x',
  type: 'boolean',
});

describe('ultra (Claude Ultracode)', () => {
  it('is disabled unless a boolean ultracode option is advertised', () => {
    assert.strictEqual(ultraRow('claude-agent-acp', [])?.disabledReason, 'Not advertised by this provider');
    assert.deepStrictEqual(ultraRow('claude-agent-acp', [ultracode(true)]), {
      disabledReason: undefined,
      label: 'Ultracode',
      on: true,
    });
  });

  it('shows no row for providers without Ultracode, Codex included', () => {
    assert.isUndefined(ultraRow('codex-acp', []));
    assert.isUndefined(ultraRow('cursor-acp', []));
  });

  it('excludes the boolean ultracode option from generic rows', () => {
    const other: NormalizedConfigOption = { currentValue: false, id: 'fast', name: 'f', type: 'boolean' };
    assert.deepStrictEqual(withoutUltraOption([ultracode(false), other]), [other]);
  });

  it('suffixes Ultracode only when on', () => {
    assert.deepStrictEqual(ultraSuffixParts('claude-agent-acp', [ultracode(true)]), ['Ultracode']);
    assert.deepStrictEqual(ultraSuffixParts('claude-agent-acp', [ultracode(false)]), []);
  });

  it('toggles the boolean ultracode option', () => {
    assert.deepStrictEqual(ultraToggleDiffs([ultracode(false)], true), [
      { configId: 'ultracode', type: 'boolean', value: true },
    ]);
    assert.deepStrictEqual(ultraToggleDiffs([], true), []);
  });
});
