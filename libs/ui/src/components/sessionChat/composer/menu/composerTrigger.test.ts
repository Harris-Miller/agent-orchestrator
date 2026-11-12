import { assert, describe, it } from '@effect/vitest';

import { detectComposerTrigger, replaceComposerTriggerRange } from './composerTrigger.ts';

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

  it('@ opens from empty query for any agent', () => {
    assert.deepStrictEqual(
      detectComposerTrigger({
        adjacentToToken: false,
        cursor: 1,
        launchTarget: 'codex-acp',
        text: '@',
      }),
      { kind: 'at', query: '', rangeEnd: 1, rangeStart: 0 },
    );
    assert.deepStrictEqual(
      detectComposerTrigger({
        adjacentToToken: false,
        cursor: 8,
        launchTarget: 'claude-agent-acp',
        text: 'see @src',
      }),
      { kind: 'at', query: 'src', rangeEnd: 8, rangeStart: 4 },
    );
  });
});
