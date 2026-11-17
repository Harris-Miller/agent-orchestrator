import { assert, describe, it } from '@effect/vitest';
import { Deferred } from 'effect';

import { addLink, claimHandle, isLinked, linkOfChild, linksOfParent, removeLink, updateLink } from './subagentLinks.ts';
import type { SpawnedLink, SpawnedLinks } from './subagentLinks.ts';

const link = (childSessionId: string, parentSessionId = 'p1'): SpawnedLink => ({
  childLaunchTarget: 'claude-agent-acp',
  childSessionId,
  description: 'd',
  handleState: 'open',
  outcome: Deferred.makeUnsafe(),
  parentLaunchTarget: 'codex-acp',
  parentSessionId,
  task: 't',
});

describe('spawned subagent links', () => {
  it('keys a child by launch target and session id', () => {
    const links: SpawnedLinks = addLink(new Map(), link('c1'));
    assert.isTrue(isLinked(links, 'claude-agent-acp', 'c1'));
    assert.isFalse(isLinked(links, 'codex-acp', 'c1'));
    assert.isFalse(isLinked(links, 'claude-agent-acp', 'c2'));
  });

  it('lists the children of one parent only, and leaves the map it was given untouched', () => {
    const base: SpawnedLinks = new Map();
    const links = addLink(addLink(addLink(base, link('c1')), link('c2')), link('c3', 'p2'));
    assert.deepStrictEqual(
      linksOfParent(links, 'codex-acp', 'p1').map(entry => entry.childSessionId),
      ['c1', 'c2'],
    );
    assert.strictEqual(base.size, 0);
    assert.strictEqual(removeLink(links, 'claude-agent-acp', 'c1').size, 2);
    assert.strictEqual(links.size, 3);
  });

  it('updates a link in place and ignores a missing one', () => {
    const links = addLink(new Map(), link('c1'));
    const updated = updateLink(links, 'claude-agent-acp', 'c1', { parentSessionId: 'p9' });
    assert.strictEqual(linkOfChild(updated, 'claude-agent-acp', 'c1')?.parentSessionId, 'p9');
    assert.strictEqual(updateLink(links, 'claude-agent-acp', 'nope', { parentSessionId: 'x' }), links);
  });

  it('hands the outcome over once: the first claim wins', () => {
    const links = addLink(new Map(), link('c1'));
    const [first, afterFirst] = claimHandle(links, 'claude-agent-acp', 'c1', 'waited');
    const [second, afterSecond] = claimHandle(afterFirst, 'claude-agent-acp', 'c1', 'reported');
    assert.deepStrictEqual([first, second], [true, false]);
    assert.strictEqual(linkOfChild(afterSecond, 'claude-agent-acp', 'c1')?.handleState, 'waited');
  });
});
