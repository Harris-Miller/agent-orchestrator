import { assert, describe, it } from '@effect/vitest';
import { AtomRegistry } from 'effect/reactivity';

import fixture from '../../fixtures/claude_subagent_session_updates.json' with { type: 'json' };

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from '../host/acpSessionBootstrap.ts';
import { initialSubagentSnapshot } from '../host/subagent.ts';
import { routeSubagentUpdate } from '../host/subagentRouting.ts';
import { composerAtom } from './composer.atoms.ts';
import { selectedActiveSessionAtom } from './selectedActiveSession.atoms.ts';
import {
  selectedAgentCanForkAtom,
  selectedAtom,
  selectedHarnessAntigravityAuthUrlAtom,
  selectedHarnessFailureAtom,
  selectedHarnessPhaseAtom,
  selectedSubagentAtom,
  selectedSubagentNameAtom,
  selectedSubagentRootIdAtom,
} from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';

const setup = () => {
  const registry = AtomRegistry.make();
  updateHarnessSnapshot(registry, 'claude-agent-acp', () => ({
    ...initialBackendHarnessSnapshot(),
    agentCapabilities: { ...initialBackendHarnessSnapshot().agentCapabilities, sessionFork: true },
    antigravityAuthUrl: 'https://auth.example',
    phase: 'usable',
    sessionHistory: [{ cwd: '/work', sessionId: 's1', title: 'T' }],
    subagents: {
      a: { ...initialSubagentSnapshot('a', 's1'), name: 'Alpha' },
      b: initialSubagentSnapshot('b', 'a'),
    },
  }));
  registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
  return registry;
};

/** Keeps `atom` mounted and counts notifications after the initial value. */
const countChanges = (
  registry: AtomRegistry.AtomRegistry,
  atom: Parameters<AtomRegistry.AtomRegistry['subscribe']>[0],
) => {
  const counter = { count: 0 };
  registry.subscribe(atom, () => {
    counter.count += 1;
  });
  return counter;
};

describe('narrow selected-snapshot atoms', () => {
  it('derive phase, failure, auth url, fork capability and child values', () => {
    const registry = setup();
    assert.strictEqual(registry.get(selectedHarnessPhaseAtom), 'usable');
    assert.isUndefined(registry.get(selectedHarnessFailureAtom));
    assert.strictEqual(registry.get(selectedHarnessAntigravityAuthUrlAtom), 'https://auth.example');
    assert.isTrue(registry.get(selectedAgentCanForkAtom));
    assert.strictEqual(registry.get(selectedSubagentNameAtom('a')), 'Alpha');
    assert.strictEqual(registry.get(selectedSubagentAtom('b'))?.sessionId, 'b');
    assert.isUndefined(registry.get(selectedSubagentAtom('missing')));
    assert.strictEqual(registry.get(selectedSubagentRootIdAtom('b')), 's1');
  });

  it('with nothing selected → undefined / false', () => {
    const registry = setup();
    registry.set(selectedAtom, undefined);
    assert.isUndefined(registry.get(selectedHarnessPhaseAtom));
    assert.isFalse(registry.get(selectedAgentCanForkAtom));
    assert.isUndefined(registry.get(selectedSubagentAtom('a')));
    assert.isUndefined(registry.get(selectedSubagentRootIdAtom('a')));
  });

  it('a child update notifies only that child; Composer atoms and sibling rows stay quiet', () => {
    const registry = setup();
    const phase = countChanges(registry, selectedHarnessPhaseAtom);
    const failure = countChanges(registry, selectedHarnessFailureAtom);
    const authUrl = countChanges(registry, selectedHarnessAntigravityAuthUrlAtom);
    const canFork = countChanges(registry, selectedAgentCanForkAtom);
    const childA = countChanges(registry, selectedSubagentAtom('a'));
    const childB = countChanges(registry, selectedSubagentAtom('b'));
    const rootB = countChanges(registry, selectedSubagentRootIdAtom('b'));
    const nameA = countChanges(registry, selectedSubagentNameAtom('a'));

    updateHarnessSnapshot(registry, 'claude-agent-acp', current => ({
      ...current,
      subagents: {
        ...current.subagents,
        b: { ...current.subagents.b, state: { state: 'running' } },
      },
    }));

    assert.deepStrictEqual(
      [phase.count, failure.count, authUrl.count, canFork.count, childA.count, rootB.count, nameA.count],
      [0, 0, 0, 0, 0, 0, 0],
    );
    assert.strictEqual(childB.count, 1);
  });
});

describe('Composer atoms vs Subagent child chunks (real routing)', () => {
  const [spawn, childMessage] = fixture;
  const CHILD = 'p1:replay-subagent:toolu_A';

  const setupRouted = () => {
    const registry = AtomRegistry.make();
    updateHarnessSnapshot(registry, 'claude-agent-acp', () => {
      const base = {
        ...initialBackendHarnessSnapshot(),
        phase: 'usable' as const,
        sessionHistory: [{ cwd: '/work', sessionId: 'p1', title: 'T' }],
        sessions: { p1: initialSessionSnapshot('p1', 'active') },
      };
      return routeSubagentUpdate(base, 'p1', spawn.update)!.snapshot;
    });
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 'p1' });
    return registry;
  };

  it('a child transcript chunk leaves composerAtom and selectedActiveSessionAtom untouched', () => {
    const registry = setupRouted();
    const composer = countChanges(registry, composerAtom);
    const active = countChanges(registry, selectedActiveSessionAtom);
    const before = [registry.get(composerAtom), registry.get(selectedActiveSessionAtom)];

    updateHarnessSnapshot(
      registry,
      'claude-agent-acp',
      current => routeSubagentUpdate(current, CHILD, childMessage.update)!.snapshot,
    );

    assert.deepStrictEqual([composer.count, active.count], [0, 0]);
    assert.strictEqual(registry.get(composerAtom), before[0]);
    assert.strictEqual(registry.get(selectedActiveSessionAtom), before[1]);
  });

  it('the selected session own data changing does change composerAtom', () => {
    const registry = setupRouted();
    const composer = countChanges(registry, composerAtom);
    updateHarnessSnapshot(registry, 'claude-agent-acp', current => ({
      ...current,
      sessions: {
        ...current.sessions,
        p1: { ...current.sessions.p1, availableCommands: [{ description: 'd', isSkill: false, name: 'x' }] },
      },
    }));
    assert.strictEqual(composer.count, 1);
  });

  it('selectedActiveSessionAtom changes when its cwd changes', () => {
    const registry = setupRouted();
    const active = countChanges(registry, selectedActiveSessionAtom);
    updateHarnessSnapshot(registry, 'claude-agent-acp', current => ({
      ...current,
      sessions: { ...current.sessions, p1: { ...current.sessions.p1, cwd: '/other' } },
    }));
    assert.strictEqual(active.count, 1);
    assert.strictEqual(registry.get(selectedActiveSessionAtom)?.cwd, '/other');
  });
});
