import { assert, describe, it } from '@effect/vitest';

import { bareNameMatchPositions, filterAvailableCommandMatches } from './filterAvailableCommands.ts';

const commands = [
  { description: 'Show status', isSkill: false, name: 'status' },
  { description: 'Compact context', isSkill: false, name: 'compact' },
  { description: 'Caveman mode', isSkill: true, name: '$caveman' },
] as const;

describe('filterAvailableCommandMatches', () => {
  it('splits by kind and lists all when query empty', () => {
    assert.deepStrictEqual(
      filterAvailableCommandMatches(commands, 'slash', '').map(match => match.command.name),
      ['status', 'compact', '$caveman'],
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
      { description: 'Grill something', isSkill: false, name: 'grill' },
      { description: 'Grill me harder', isSkill: false, name: 'grill-me' },
      { description: 'Mentions grill in prose', isSkill: false, name: 'status' },
    ] as const;
    assert.deepStrictEqual(
      filterAvailableCommandMatches(mixed, 'slash', 'grill').map(match => match.command.name),
      ['grill', 'grill-me', 'status'],
    );
    assert.deepStrictEqual(
      filterAvailableCommandMatches(
        [{ description: 'Mode', isSkill: true, name: '$caveman' }],
        'dollar',
        'caveman',
      ).map(match => match.command.name),
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
      { description: 'unrelated', isSkill: false, name: 'alpha-tool' },
      { description: 'mentions alpha in prose', isSkill: false, name: 'other' },
      { description: 'alpha also in description', isSkill: false, name: 'alpha-helper' },
    ] as const;
    assert.deepStrictEqual(
      filterAvailableCommandMatches(mixed, 'slash', 'alpha').map(match => match.command.name),
      ['alpha-tool', 'alpha-helper', 'other'],
    );
  });

  it('hides per-agent blocklisted slash commands from the menu', () => {
    const mixed = ['color', 'config', 'dataviz', 'effect', 'fast', 'model', 'logout', 'status'].map(name => ({
      description: name,
      isSkill: false,
      name,
    }));
    assert.deepStrictEqual(
      filterAvailableCommandMatches(mixed, 'slash', '', 'claude-agent-acp').map(match => match.command.name),
      ['color', 'config', 'dataviz', 'model', 'logout', 'status'],
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

describe('cross-provider skills', () => {
  const claude = [
    { isSkill: false, name: 'status' },
    { isSkill: true, name: 'caveman' },
    { isSkill: true, name: 'dataviz' },
  ];
  it('$ lists only skills; / lists everything', () => {
    assert.deepStrictEqual(
      filterAvailableCommandMatches(claude, 'dollar', '', 'claude-agent-acp').map(m => m.command.name),
      ['caveman', 'dataviz'],
    );
    assert.deepStrictEqual(
      filterAvailableCommandMatches([...claude, { isSkill: true, name: '$tdd' }], 'slash', '', 'claude-agent-acp').map(
        m => m.command.name,
      ),
      ['status', 'caveman', 'dataviz', '$tdd'],
    );
  });
});
