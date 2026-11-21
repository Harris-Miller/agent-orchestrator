import { assert, describe, it } from '@effect/vitest';

import fixture from '../../fixtures/claude_subagent_session_updates.json' with { type: 'json' };

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { applyLiveSessionUpdate, reconcileConnectionLost } from './harnessStateTransitions.ts';
import type { PendingPermission } from './pendingInteractions.ts';
import { resetSubagentsOfRoot } from './subagentRouting.ts';

const CHILD = 'p1:replay-subagent:toolu_A';
const [spawn, childMessage, done] = fixture;

const withRoot = () => ({
  ...initialBackendHarnessSnapshot(),
  sessions: { p1: initialSessionSnapshot('p1', 'active') },
});

describe('applyLiveSessionUpdate on the Subagent tree', () => {
  it('leaves root and unseen-id updates to the root Session', () => {
    const snapshot = withRoot();
    const routed = applyLiveSessionUpdate(snapshot, 'p1', childMessage.update);
    assert.deepStrictEqual(routed.snapshot.subagents, {});
    assert.isUndefined(routed.linked);
    assert.strictEqual(
      applyLiveSessionUpdate(snapshot, 'p1', { sessionUpdate: 'agent_message_chunk' }).snapshot,
      snapshot,
    );
  });

  it('spawn creates the child, one parent row, and replay does not duplicate', () => {
    const once = applyLiveSessionUpdate(withRoot(), 'p1', spawn.update);
    assert.deepStrictEqual(once?.linked, { childId: CHILD, parentId: 'p1' });
    const twice = applyLiveSessionUpdate(once.snapshot, 'p1', spawn.update);
    assert.strictEqual(twice.snapshot.sessions.p1.transcript.items.length, 1);
    assert.strictEqual(Object.keys(twice.snapshot.subagents).length, 1);
  });

  it('routes child updates into the child transcript only', () => {
    const spawned = applyLiveSessionUpdate(withRoot(), 'p1', spawn.update).snapshot;
    const next = applyLiveSessionUpdate(spawned, CHILD, childMessage.update).snapshot;
    assert.strictEqual(next.subagents[CHILD].transcript.items.length, 1);
    assert.strictEqual(next.sessions.p1.transcript.items.length, 1);
    const finished = applyLiveSessionUpdate(next, 'p1', done.update).snapshot;
    assert.deepStrictEqual(finished.subagents[CHILD].state, { state: 'completed' });
  });

  it('routes child output that arrives with no Prompt turn in flight into the child transcript', () => {
    const spawned = applyLiveSessionUpdate(withRoot(), 'p1', spawn.update).snapshot;
    assert.isUndefined(spawned.sessions.p1.pendingClientRequest);
    const next = applyLiveSessionUpdate(spawned, CHILD, childMessage.update).snapshot;
    assert.strictEqual(next.subagents[CHILD].transcript.items.length, 1);
  });

  it('migrates a stray root snapshot and never reparents', () => {
    const base = {
      ...withRoot(),
      sessions: { ...withRoot().sessions, [CHILD]: initialSessionSnapshot(CHILD, 'active') },
    };
    const result = applyLiveSessionUpdate(base, 'p1', spawn.update);
    assert.notProperty(result.snapshot.sessions, CHILD);
    const again = applyLiveSessionUpdate(result.snapshot, 'other', spawn.update);
    assert.strictEqual(again.snapshot.subagents[CHILD].parentSessionId, 'p1');
  });

  it('keeps the transcript and pending request that arrived before the spawn', () => {
    const early = applyLiveSessionUpdate(withRoot(), CHILD, childMessage.update);
    assert.deepStrictEqual(early.snapshot.subagents, {});
    const resolved: unknown[] = [];
    const permission = {
      request: {} as PendingPermission['request'],
      resolve: (value: unknown) => resolved.push(value),
      sessionId: CHILD,
    };
    const stray = {
      ...initialSessionSnapshot(CHILD, 'active'),
      pendingPermission: permission,
      transcript: {
        ...initialSessionSnapshot(CHILD, 'active').transcript,
        items: [{ id: 'm', kind: 'agent_message', text: 'hi' }],
      },
    };
    const base = { ...withRoot(), sessions: { ...withRoot().sessions, [CHILD]: stray } } as never as ReturnType<
      typeof withRoot
    >;
    const result = applyLiveSessionUpdate(base, 'p1', spawn.update);
    assert.notProperty(result.snapshot.sessions, CHILD);
    assert.strictEqual(result.snapshot.subagents[CHILD].transcript.items.length, 1);
    assert.strictEqual(result.snapshot.subagents[CHILD].pendingPermission, permission);
    assert.lengthOf(resolved, 0);
  });

  it('rejects self-reference and cycles; supports nesting', () => {
    const spawned = applyLiveSessionUpdate(withRoot(), 'p1', spawn.update).snapshot;
    const self = applyLiveSessionUpdate(spawned, CHILD, {
      sessionUpdate: 'subagent_spawned',
      subagentSessionId: CHILD,
    });
    assert.isUndefined(self.linked);
    const cycle = applyLiveSessionUpdate(spawned, CHILD, {
      sessionUpdate: 'subagent_spawned',
      subagentSessionId: 'p1',
    });
    assert.notProperty(cycle.snapshot.subagents, 'p1');
    const nested = applyLiveSessionUpdate(spawned, CHILD, {
      sessionUpdate: 'subagent_spawned',
      subagentSessionId: 'g1',
    });
    assert.strictEqual(nested.snapshot.subagents.g1.parentSessionId, CHILD);
    assert.strictEqual(nested.snapshot.subagents[CHILD].transcript.items.length, 1);
  });
});

describe('load / connection loss', () => {
  it('keeps transcripts and terminal state, clears capabilities', () => {
    const spawned = applyLiveSessionUpdate(withRoot(), 'p1', spawn.update).snapshot;
    const replied = applyLiveSessionUpdate(spawned, CHILD, childMessage.update).snapshot;
    const { snapshot } = applyLiveSessionUpdate(replied, 'p1', done.update);
    for (const next of [resetSubagentsOfRoot(snapshot, 'p1'), reconcileConnectionLost(snapshot)]) {
      assert.deepStrictEqual(next.subagents[CHILD].state, { state: 'completed' });
      assert.isUndefined(next.subagents[CHILD].capabilities);
      assert.strictEqual(next.subagents[CHILD].transcript.items.length, 1);
    }
  });
});
