import { assert, describe, it } from '@effect/vitest';
import { AtomRegistry } from 'effect/reactivity';

import { initialBackendHarnessSnapshot } from '../host/acpSessionBootstrap.ts';
import { initialSubagentSnapshot } from '../host/subagent.ts';
import { selectedAtom, viewedSubagentAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { sessionHeaderAtom } from './sessionHeader.atoms.ts';

const setup = () => {
  const registry = AtomRegistry.make();
  updateHarnessSnapshot(registry, 'claude-agent-acp', () => ({
    ...initialBackendHarnessSnapshot(),
    sessionHistory: [{ cwd: '/work', sessionId: 's1', title: 'Fix the build' }],
    subagents: { c1: initialSubagentSnapshot('c1', 's1') },
  }));
  return registry;
};

describe('sessionHeaderAtom', () => {
  it('Session with a History entry → entry title, Session actions shown', () => {
    const registry = setup();
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
    const header = registry.get(sessionHeaderAtom);
    assert.strictEqual(header.title, 'Fix the build');
    assert.strictEqual(header.launchTarget, 'claude-agent-acp');
    assert.isTrue(header.showActions);
  });

  it('Session missing a History row → no entry, Session actions hidden', () => {
    const registry = setup();
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 'no-row' });
    const header = registry.get(sessionHeaderAtom);
    assert.isUndefined(header.entry);
    assert.isFalse(header.showActions);
  });

  it('Subagent view of the Selected session → Session actions hidden', () => {
    const registry = setup();
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
    registry.set(viewedSubagentAtom, { childId: 'c1', launchTarget: 'claude-agent-acp', rootSessionId: 's1' });
    const header = registry.get(sessionHeaderAtom);
    assert.strictEqual(header.title, 'Fix the build');
    assert.isFalse(header.showActions);
  });

  it('viewed child no longer exists → Session actions shown (body shows the root transcript)', () => {
    const registry = setup();
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
    registry.set(viewedSubagentAtom, { childId: 'gone', launchTarget: 'claude-agent-acp', rootSessionId: 's1' });
    assert.isTrue(registry.get(sessionHeaderAtom).showActions);
  });

  it('viewed subagent belongs to another root → Session actions shown', () => {
    const registry = setup();
    registry.set(selectedAtom, { _tag: 'Session', sessionId: 's1' });
    registry.set(viewedSubagentAtom, { childId: 'c1', launchTarget: 'claude-agent-acp', rootSessionId: 'other' });
    assert.isTrue(registry.get(sessionHeaderAtom).showActions);
  });

  it('Virtual → New Session, Session actions hidden', () => {
    const registry = setup();
    registry.set(selectedAtom, { _tag: 'Virtual' });
    const header = registry.get(sessionHeaderAtom);
    assert.strictEqual(header.title, 'New Session');
    assert.isUndefined(header.entry);
    assert.isFalse(header.showActions);
  });

  it('Selected unset → Chat, Session actions hidden', () => {
    const registry = setup();
    const header = registry.get(sessionHeaderAtom);
    assert.strictEqual(header.title, 'Chat');
    assert.isUndefined(header.launchTarget);
    assert.isFalse(header.showActions);
  });
});
