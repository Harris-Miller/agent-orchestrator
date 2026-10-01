import { assert, describe, it } from '@effect/vitest';

import {
  commandInvocation,
  findExactCommandMatch,
  replaceComposerTriggerRange,
  splitComposerCommandSegments,
} from './composerCommandTokens.ts';
import { detectComposerTrigger } from './detectComposerTrigger.ts';
import { filterAvailableCommands } from './filterAvailableCommands.ts';

const commands = [
  { description: 'Show status', name: 'status' },
  { description: 'Compact context', name: 'compact' },
  { description: 'Caveman mode', name: '$caveman' },
] as const;

describe('commandInvocation', () => {
  it('prefixes slash names and leaves $ names', () => {
    assert.strictEqual(commandInvocation('status'), '/status');
    assert.strictEqual(commandInvocation('$caveman'), '$caveman');
  });
});

describe('findExactCommandMatch', () => {
  it('matches invocation forms only', () => {
    assert.strictEqual(findExactCommandMatch('/status', commands)?.name, 'status');
    assert.strictEqual(findExactCommandMatch('$caveman', commands)?.name, '$caveman');
    assert.strictEqual(findExactCommandMatch('status', commands), undefined);
    assert.strictEqual(findExactCommandMatch('/sta', commands), undefined);
  });
});

describe('splitComposerCommandSegments', () => {
  it('chipifies whitespace-committed exact matches only', () => {
    assert.deepStrictEqual(splitComposerCommandSegments('/status more', commands), [
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' more' },
    ]);
    assert.deepStrictEqual(splitComposerCommandSegments('/status ', commands), [
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' ' },
    ]);
    // In-progress exact token at EOF stays text until whitespace commit.
    assert.deepStrictEqual(splitComposerCommandSegments('/status', commands), [{ kind: 'text', value: '/status' }]);
    assert.deepStrictEqual(splitComposerCommandSegments('hi /sta', commands), [{ kind: 'text', value: 'hi /sta' }]);
    assert.deepStrictEqual(splitComposerCommandSegments('/status $caveman', commands), [
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' $caveman' },
    ]);
    assert.deepStrictEqual(splitComposerCommandSegments('/status $caveman ', commands), [
      { kind: 'command', value: '/status' },
      { kind: 'text', value: ' ' },
      { kind: 'command', value: '$caveman' },
      { kind: 'text', value: ' ' },
    ]);
  });
});

describe('replaceComposerTriggerRange', () => {
  it('inserts invocation plus space and coalesces an existing space', () => {
    assert.deepStrictEqual(
      replaceComposerTriggerRange('/sta', { kind: 'slash', query: 'sta', rangeEnd: 4, rangeStart: 0 }, '/status'),
      { cursor: 8, text: '/status ' },
    );
    assert.deepStrictEqual(
      replaceComposerTriggerRange('/sta done', { kind: 'slash', query: 'sta', rangeEnd: 4, rangeStart: 0 }, '/status'),
      { cursor: 8, text: '/status done' },
    );
  });
});

describe('detectComposerTrigger', () => {
  it('codex: / only at draft start; $ anywhere', () => {
    assert.deepStrictEqual(
      detectComposerTrigger({
        adjacentToToken: false,
        cursor: 4,
        launchTarget: 'codex-acp',
        text: '/sta',
      }),
      { kind: 'slash', query: 'sta', rangeEnd: 4, rangeStart: 0 },
    );
    assert.strictEqual(
      detectComposerTrigger({
        adjacentToToken: false,
        cursor: 8,
        launchTarget: 'codex-acp',
        text: 'say /sta',
      }),
      null,
    );
    assert.deepStrictEqual(
      detectComposerTrigger({
        adjacentToToken: false,
        cursor: 10,
        launchTarget: 'codex-acp',
        text: 'use $cavem',
      }),
      { kind: 'dollar', query: 'cavem', rangeEnd: 10, rangeStart: 4 },
    );
  });

  it('non-codex: / anywhere; no $', () => {
    assert.deepStrictEqual(
      detectComposerTrigger({
        adjacentToToken: false,
        cursor: 8,
        launchTarget: 'claude-agent-acp',
        text: 'say /sta',
      }),
      { kind: 'slash', query: 'sta', rangeEnd: 8, rangeStart: 4 },
    );
    assert.strictEqual(
      detectComposerTrigger({
        adjacentToToken: false,
        cursor: 5,
        launchTarget: 'claude-agent-acp',
        text: '$cave',
      }),
      null,
    );
  });

  it('suppresses when adjacent to a token', () => {
    assert.strictEqual(
      detectComposerTrigger({
        adjacentToToken: true,
        cursor: 1,
        launchTarget: 'codex-acp',
        text: '/',
      }),
      null,
    );
  });
});

describe('filterAvailableCommands', () => {
  it('splits by kind and lists all when query empty', () => {
    assert.deepStrictEqual(
      filterAvailableCommands(commands, 'slash', '').map(command => command.name),
      ['status', 'compact'],
    );
    assert.deepStrictEqual(
      filterAvailableCommands(commands, 'dollar', '').map(command => command.name),
      ['$caveman'],
    );
  });

  it('fzf-filters name and description', () => {
    assert.deepStrictEqual(
      filterAvailableCommands(commands, 'slash', 'comp').map(command => command.name),
      ['compact'],
    );
    assert.deepStrictEqual(
      filterAvailableCommands(commands, 'slash', 'Show').map(command => command.name),
      ['status'],
    );
    assert.deepStrictEqual(filterAvailableCommands(commands, 'slash', 'zzzz'), []);
  });

  it('exact bare-name matches first, then remaining fzf hits', () => {
    const mixed = [
      { description: 'Grill something', name: 'grill' },
      { description: 'Grill me harder', name: 'grill-me' },
      { description: 'Mentions grill in prose', name: 'status' },
    ] as const;
    assert.deepStrictEqual(
      filterAvailableCommands(mixed, 'slash', 'grill').map(command => command.name),
      ['grill', 'grill-me', 'status'],
    );
    assert.deepStrictEqual(
      filterAvailableCommands([{ description: 'Mode', name: '$caveman' }], 'dollar', 'caveman').map(
        command => command.name,
      ),
      ['$caveman'],
    );
  });

  it('lists name matches before description matches without duplicates', () => {
    const mixed = [
      { description: 'unrelated', name: 'alpha-tool' },
      { description: 'mentions alpha in prose', name: 'other' },
      { description: 'alpha also in description', name: 'alpha-helper' },
    ] as const;
    assert.deepStrictEqual(
      filterAvailableCommands(mixed, 'slash', 'alpha').map(command => command.name),
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
      filterAvailableCommands(mixed, 'slash', '', 'claude-agent-acp').map(command => command.name),
      ['logout', 'status'],
    );
    assert.deepStrictEqual(
      filterAvailableCommands(mixed, 'slash', '', 'codex-acp').map(command => command.name),
      ['color', 'config', 'dataviz', 'effect', 'fast', 'model', 'status'],
    );
    assert.deepStrictEqual(
      filterAvailableCommands(mixed, 'slash', 'eff', 'claude-agent-acp').map(command => command.name),
      [],
    );
  });
});
