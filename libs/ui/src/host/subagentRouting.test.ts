import { assert, describe, it } from '@effect/vitest';

import fixture from '../../fixtures/claude_subagent_session_updates.json' with { type: 'json' };

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { reconcileStoppedProvider } from './harnessStateTransitions.ts';
import { resetSubagentsOfRoot, routeSubagentUpdate } from './subagentRouting.ts';

const CHILD = 'p1:replay-subagent:toolu_A';
const [spawn, childMessage, done] = fixture;

const withRoot = () => ({
  ...initialBackendHarnessSnapshot(),
  sessions: { p1: initialSessionSnapshot('p1', 'active') },
});

describe('routeSubagentUpdate', () => {
  it('leaves root and unseen-id updates to the root path', () => {
    const snapshot = withRoot();
    assert.isUndefined(routeSubagentUpdate(snapshot, 'p1', childMessage.update));
    assert.isUndefined(routeSubagentUpdate(snapshot, 'p1', { sessionUpdate: 'agent_message_chunk' }));
  });

  it('spawn creates the child, one parent row, and replay does not duplicate', () => {
    const once = routeSubagentUpdate(withRoot(), 'p1', spawn.update);
    assert.deepStrictEqual(once?.linked, { childId: CHILD, migratedRoot: false, parentId: 'p1' });
    const twice = routeSubagentUpdate(once!.snapshot, 'p1', spawn.update);
    assert.strictEqual(twice!.snapshot.sessions.p1.transcript.items.length, 1);
    assert.strictEqual(Object.keys(twice!.snapshot.subagents).length, 1);
  });

  it('routes child updates into the child transcript only', () => {
    const spawned = routeSubagentUpdate(withRoot(), 'p1', spawn.update)!.snapshot;
    const next = routeSubagentUpdate(spawned, CHILD, childMessage.update)!.snapshot;
    assert.strictEqual(next.subagents[CHILD].transcript.items.length, 1);
    assert.strictEqual(next.sessions.p1.transcript.items.length, 1);
    const finished = routeSubagentUpdate(next, 'p1', done.update)!.snapshot;
    assert.deepStrictEqual(finished.subagents[CHILD].state, { state: 'completed' });
  });

  it('migrates a stray root snapshot and never reparents', () => {
    const base = {
      ...withRoot(),
      sessions: { ...withRoot().sessions, [CHILD]: initialSessionSnapshot(CHILD, 'active') },
    };
    const result = routeSubagentUpdate(base, 'p1', spawn.update)!;
    assert.isTrue(result.linked?.migratedRoot);
    assert.notProperty(result.snapshot.sessions, CHILD);
    const again = routeSubagentUpdate(result.snapshot, 'other', spawn.update)!;
    assert.strictEqual(again.snapshot.subagents[CHILD].parentSessionId, 'p1');
  });

  it('rejects self-reference and cycles; supports nesting', () => {
    const spawned = routeSubagentUpdate(withRoot(), 'p1', spawn.update)!.snapshot;
    const self = routeSubagentUpdate(spawned, CHILD, { sessionUpdate: 'subagent_spawned', subagentSessionId: CHILD })!;
    assert.isUndefined(self.linked);
    const cycle = routeSubagentUpdate(spawned, CHILD, { sessionUpdate: 'subagent_spawned', subagentSessionId: 'p1' })!;
    assert.notProperty(cycle.snapshot.subagents, 'p1');
    const nested = routeSubagentUpdate(spawned, CHILD, { sessionUpdate: 'subagent_spawned', subagentSessionId: 'g1' })!;
    assert.strictEqual(nested.snapshot.subagents.g1.parentSessionId, CHILD);
    assert.strictEqual(nested.snapshot.subagents[CHILD].transcript.items.length, 1);
  });
});

describe('load / connection loss', () => {
  it('keeps transcripts and terminal state, clears capabilities', () => {
    const spawned = routeSubagentUpdate(withRoot(), 'p1', spawn.update)!.snapshot;
    const replied = routeSubagentUpdate(spawned, CHILD, childMessage.update)!.snapshot;
    const { snapshot } = routeSubagentUpdate(replied, 'p1', done.update)!;
    for (const next of [resetSubagentsOfRoot(snapshot, 'p1'), reconcileStoppedProvider(snapshot)]) {
      assert.deepStrictEqual(next.subagents[CHILD].state, { state: 'completed' });
      assert.isUndefined(next.subagents[CHILD].capabilities);
      assert.strictEqual(next.subagents[CHILD].transcript.items.length, 1);
    }
  });
});
