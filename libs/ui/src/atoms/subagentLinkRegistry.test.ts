import { assert, describe, it } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import type { SessionRef } from '../host/agentLaunchTarget.ts';

import {
  allLinks,
  atMaxSpawnDepth,
  attach,
  childrenOf,
  claimHandle,
  end,
  isChild,
  isChildIn,
  linkOf,
  MAX_LIVE_CHILDREN,
  reserveSlot,
  slotsInUse,
  subagentLinksAtom,
} from './subagentLinkRegistry.ts';

const parent: SessionRef = { launchTarget: 'codex-acp', sessionId: 'p1' };
const child = (sessionId: string, launchTarget: SessionRef['launchTarget'] = 'claude-agent-acp'): SessionRef => ({
  launchTarget,
  sessionId,
});

const reserve = (registry: AtomRegistry.AtomRegistry, of: SessionRef = parent) => {
  const slot = reserveSlot(registry, of);
  if (slot === undefined) {
    throw new Error('no slot');
  }
  return slot;
};
const link = (registry: AtomRegistry.AtomRegistry, c: SessionRef, of: SessionRef = parent) =>
  reserve(registry, of).register({ child: c, description: 'd', task: 't' });

describe('identity', () => {
  it.each([
    ['same launch target and session', child('c1'), true],
    ['other launch target', child('c1', 'codex-acp'), false],
    ['other session id', child('c2'), false],
  ] as const)('keys a child by launch target and session id: %s', (_label, ref, expected) => {
    const registry = AtomRegistry.make();
    link(registry, child('c1'));
    assert.strictEqual(isChild(registry, ref), expected);
    assert.strictEqual(isChildIn(registry.get(subagentLinksAtom), ref), expected);
    assert.strictEqual(linkOf(registry, ref) !== undefined, expected);
  });

  it('lists children of one parent; allLinks lists all', () => {
    const registry = AtomRegistry.make();
    const other: SessionRef = { launchTarget: 'codex-acp', sessionId: 'p2' };
    link(registry, child('c1'));
    link(registry, child('c2'));
    link(registry, child('c3'), other);
    assert.deepStrictEqual(
      childrenOf(registry, parent).map(entry => entry.childSessionId),
      ['c1', 'c2'],
    );
    assert.strictEqual(allLinks(registry).length, 3);
  });

  it('atMaxSpawnDepth is true only for a child', () => {
    const registry = AtomRegistry.make();
    link(registry, child('c1'));
    assert.isFalse(atMaxSpawnDepth(registry, parent));
    assert.isTrue(atMaxSpawnDepth(registry, child('c1')));
  });
});

describe('register', () => {
  it('builds an open link under the slot parent with a fresh outcome', () => {
    const registry = AtomRegistry.make();
    const made = link(registry, child('c1'));
    assert.strictEqual(made.handleState, 'open');
    assert.strictEqual(made.parentSessionId, 'p1');
    assert.strictEqual(made.parentLaunchTarget, 'codex-acp');
    assert.isFalse(Deferred.isDoneUnsafe(made.outcome));
    assert.strictEqual(linkOf(registry, child('c1')), made);
  });

  it('throws when the slot is registered or released twice', () => {
    const registry = AtomRegistry.make();
    const slot = reserve(registry);
    slot.register({ child: child('c1'), description: 'd', task: 't' });
    assert.throws(() => slot.register({ child: child('c2'), description: 'd', task: 't' }));
    const released = reserve(registry);
    released.release();
    assert.throws(() => released.register({ child: child('c3'), description: 'd', task: 't' }));
  });
});

describe('cap', () => {
  it('allows MAX_LIVE_CHILDREN reservations, refuses the next, and frees on release', () => {
    const registry = AtomRegistry.make();
    const slots = Array.from({ length: MAX_LIVE_CHILDREN }, () => reserve(registry));
    assert.isUndefined(reserveSlot(registry, parent));
    slots[0].release();
    slots[0].release();
    assert.strictEqual(slotsInUse(registry, parent), MAX_LIVE_CHILDREN - 1);
    assert.isDefined(reserveSlot(registry, parent));
  });

  it('reserves exactly MAX_LIVE_CHILDREN of 12 synchronous attempts', () => {
    const registry = AtomRegistry.make();
    const got = Array.from({ length: 12 }, () => reserveSlot(registry, parent)).filter(slot => slot !== undefined);
    assert.strictEqual(got.length, MAX_LIVE_CHILDREN);
  });

  it('register replaces the reservation without changing slotsInUse', () => {
    const registry = AtomRegistry.make();
    const slot = reserve(registry);
    assert.strictEqual(slotsInUse(registry, parent), 1);
    slot.register({ child: child('c1'), description: 'd', task: 't' });
    assert.strictEqual(slotsInUse(registry, parent), 1);
  });

  it('stops counting a child whose outcome is done, and caps per parent', () => {
    const registry = AtomRegistry.make();
    const made = link(registry, child('c1'));
    Deferred.doneUnsafe(made.outcome, Effect.succeed({ status: 'completed', text: '' }));
    assert.strictEqual(slotsInUse(registry, parent), 0);
    for (let i = 0; i < MAX_LIVE_CHILDREN; i += 1) {
      reserve(registry);
    }
    assert.isDefined(reserveSlot(registry, { launchTarget: 'codex-acp', sessionId: 'p2' }));
  });
});

describe('claimHandle', () => {
  it('first caller wins', () => {
    const registry = AtomRegistry.make();
    link(registry, child('c1'));
    assert.isTrue(claimHandle(registry, child('c1'), 'waited'));
    assert.isFalse(claimHandle(registry, child('c1'), 'reported'));
    assert.strictEqual(linkOf(registry, child('c1'))?.handleState, 'waited');
  });
});

describe('attach and end', () => {
  it.effect('attach is a no-op for a missing link', () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      const reporter = yield* Effect.forkChild(Effect.never);
      attach(registry, child('nope'), { reporter });
      assert.strictEqual(allLinks(registry).length, 0);
    }),
  );

  it.effect('end removes the link once and interrupts projection and reporter', () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      link(registry, child('c1'));
      const projection = yield* Effect.forkChild(Effect.never);
      const reporter = yield* Effect.forkChild(Effect.never);
      attach(registry, child('c1'), { projection });
      attach(registry, child('c1'), { reporter });
      const removed = yield* end(registry, child('c1'));
      assert.strictEqual(removed?.childSessionId, 'c1');
      assert.isFalse(isChild(registry, child('c1')));
      assert.isTrue(Exit.isFailure(yield* Fiber.await(projection)));
      assert.isTrue(Exit.isFailure(yield* Fiber.await(reporter)));
      assert.isUndefined(yield* end(registry, child('c1')));
    }),
  );
});
