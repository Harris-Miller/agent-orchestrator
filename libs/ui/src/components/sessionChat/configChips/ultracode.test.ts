import { assert, describe, it } from '@effect/vitest';

import type { NormalizedConfigOption } from '../../../host/acpSessionBootstrap.ts';

import { ultracodeRow, ultracodeSuffixParts, ultracodeToggleDiffs, withoutUltracodeOption } from './ultracode.ts';

const ultracode = (currentValue: boolean): NormalizedConfigOption => ({
  currentValue,
  id: 'ultracode',
  name: 'x',
  type: 'boolean',
});

describe('ultracode (Claude Ultracode)', () => {
  it('is disabled unless a boolean ultracode option is advertised', () => {
    assert.strictEqual(ultracodeRow('claude-agent-acp', [])?.disabledReason, 'Not advertised by this provider');
    assert.deepStrictEqual(ultracodeRow('claude-agent-acp', [ultracode(true)]), {
      disabledReason: undefined,
      label: 'Ultracode',
      on: true,
    });
  });

  it('shows no row for providers without Ultracode, Codex included', () => {
    assert.isUndefined(ultracodeRow('codex-acp', []));
    assert.isUndefined(ultracodeRow('cursor-acp', []));
  });

  it('excludes the boolean ultracode option from generic rows', () => {
    const other: NormalizedConfigOption = { currentValue: false, id: 'fast', name: 'f', type: 'boolean' };
    assert.deepStrictEqual(withoutUltracodeOption([ultracode(false), other]), [other]);
  });

  it('suffixes Ultracode only when on', () => {
    assert.deepStrictEqual(ultracodeSuffixParts('claude-agent-acp', [ultracode(true)]), ['Ultracode']);
    assert.deepStrictEqual(ultracodeSuffixParts('claude-agent-acp', [ultracode(false)]), []);
  });

  it('toggles the boolean ultracode option', () => {
    assert.deepStrictEqual(ultracodeToggleDiffs([ultracode(false)], true), [
      { configId: 'ultracode', type: 'boolean', value: true },
    ]);
    assert.deepStrictEqual(ultracodeToggleDiffs([], true), []);
  });
});
