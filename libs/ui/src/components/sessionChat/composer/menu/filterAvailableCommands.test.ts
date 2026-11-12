import { assert, describe, it } from '@effect/vitest';

import { bareNameMatchPositions, filterAvailableCommandMatches } from './filterAvailableCommands.ts';

const commands = [
  { description: 'Show status', name: 'status' },
  { description: 'Compact context', name: 'compact' },
  { description: 'Caveman mode', name: '$caveman' },
] as const;

describe('filterAvailableCommandMatches', () => {
  it('splits by kind and lists all when query empty', () => {
    assert.deepStrictEqual(
      filterAvailableCommandMatches(commands, 'slash', '').map(match => match.command.name),
      ['status', 'compact'],
    );
    assert.deepStrictEqual(
      filterAvailableCommandMatches(commands, 'dollar', '').map(match => match.command.name),
      ['$caveman'],
    );
  });

  it('empty query has no positions', () => {
    const matches = filterAvailableCommandMatches(commands, 'slash', '');
    assert.strictEqual(matches[0]?.positions.size, 0);
    assert.strictEqual(matches[0]?.field, 'name');
  });

  it('fzf-filters name and description', () => {
    assert.deepStrictEqual(
      filterAvailableCommandMatches(commands, 'slash', 'comp').map(match => match.command.name),
      ['compact'],
    );
    assert.deepStrictEqual(
      filterAvailableCommandMatches(commands, 'slash', 'Show').map(match => match.command.name),
      ['status'],
    );
    assert.deepStrictEqual(filterAvailableCommandMatches(commands, 'slash', 'zzzz'), []);
  });

  it('keeps fzf name positions', () => {
    const matches = filterAvailableCommandMatches(commands, 'slash', 'comp');
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0]?.command.name, 'compact');
    assert.strictEqual(matches[0]?.field, 'name');
    assert.isTrue(matches[0]?.positions.has(0));
    assert.isTrue(matches[0]?.positions.has(1));
    assert.isTrue(matches[0]?.positions.has(2));
    assert.isTrue(matches[0]?.positions.has(3));
  });

  it('description-only matches highlight description field', () => {
    const matches = filterAvailableCommandMatches(commands, 'slash', 'Show');
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0]?.command.name, 'status');
    assert.strictEqual(matches[0]?.field, 'description');
    assert.deepStrictEqual(
      [...(matches[0]?.positions ?? [])].sort((a, b) => a - b),
      [0, 1, 2, 3],
    );
  });

  it('exact bare-name matches first, then remaining fzf hits', () => {
    const mixed = [
      { description: 'Grill something', name: 'grill' },
      { description: 'Grill me harder', name: 'grill-me' },
      { description: 'Mentions grill in prose', name: 'status' },
    ] as const;
    assert.deepStrictEqual(
      filterAvailableCommandMatches(mixed, 'slash', 'grill').map(match => match.command.name),
      ['grill', 'grill-me', 'status'],
    );
    assert.deepStrictEqual(
      filterAvailableCommandMatches([{ description: 'Mode', name: '$caveman' }], 'dollar', 'caveman').map(
        match => match.command.name,
      ),
      ['$caveman'],
    );
  });

  it('exact bare-name matches highlight the bare-name span', () => {
    assert.deepStrictEqual(
      [...bareNameMatchPositions('status')].sort((a, b) => a - b),
      [0, 1, 2, 3, 4, 5],
    );
    assert.deepStrictEqual(
      [...bareNameMatchPositions('$caveman')].sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7],
    );
    const slashExact = filterAvailableCommandMatches(commands, 'slash', 'status');
    assert.strictEqual(slashExact[0]?.field, 'name');
    assert.deepStrictEqual(
      [...(slashExact[0]?.positions ?? [])].sort((a, b) => a - b),
      [0, 1, 2, 3, 4, 5],
    );
    const dollarExact = filterAvailableCommandMatches(commands, 'dollar', 'caveman');
    assert.strictEqual(dollarExact[0]?.field, 'name');
    assert.deepStrictEqual(
      [...(dollarExact[0]?.positions ?? [])].sort((a, b) => a - b),
      [1, 2, 3, 4, 5, 6, 7],
    );
  });

  it('lists name matches before description matches without duplicates', () => {
    const mixed = [
      { description: 'unrelated', name: 'alpha-tool' },
      { description: 'mentions alpha in prose', name: 'other' },
      { description: 'alpha also in description', name: 'alpha-helper' },
    ] as const;
    assert.deepStrictEqual(
      filterAvailableCommandMatches(mixed, 'slash', 'alpha').map(match => match.command.name),
      ['alpha-tool', 'alpha-helper', 'other'],
    );
  });

  it('hides per-agent blocklisted slash commands from the menu', () => {
    const mixed = [
      { description: 'Color', name: 'color' },
      { description: 'Config', name: 'config' },
      { description: 'Dataviz', name: 'dataviz' },
      { description: 'Effect', name: 'effect' },
      { description: 'Fast', name: 'fast' },
      { description: 'Model', name: 'model' },
      { description: 'Logout', name: 'logout' },
      { description: 'Status', name: 'status' },
    ] as const;
    assert.deepStrictEqual(
      filterAvailableCommandMatches(mixed, 'slash', '', 'claude-agent-acp').map(match => match.command.name),
      ['logout', 'status'],
    );
    assert.deepStrictEqual(
      filterAvailableCommandMatches(mixed, 'slash', '', 'codex-acp').map(match => match.command.name),
      ['color', 'config', 'dataviz', 'effect', 'fast', 'model', 'status'],
    );
    assert.deepStrictEqual(
      filterAvailableCommandMatches(mixed, 'slash', 'eff', 'claude-agent-acp').map(match => match.command.name),
      [],
    );
  });
});
