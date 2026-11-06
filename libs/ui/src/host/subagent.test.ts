import { assert, describe, it } from '@effect/vitest';

import fixture from '../../fixtures/claude_subagent_session_updates.json' with { type: 'json' };

import {
  applySubagentPatch,
  canCancelSubagent,
  initialSubagentSnapshot,
  isSubagentFinished,
  parseSubagentWorkState,
  reduceSubagentTranscriptUpdate,
  resetSubagentLiveState,
  rootAncestorId,
  subagentLatestActivity,
  subagentNeedsInput,
} from './subagent.ts';
import { emptySessionTranscript, reduceSessionUpdate, upsertSubagentRow } from './sessionUpdateReducer.ts';

const [, fixtureMessage] = fixture;
const child = () => initialSubagentSnapshot('c1', 'p1');

describe('parseSubagentWorkState', () => {
  it('accepts string, object, and unknown values without failing', () => {
    assert.deepStrictEqual(parseSubagentWorkState('completed'), { state: 'completed' });
    assert.deepStrictEqual(parseSubagentWorkState({ state: 'idle', stopReason: 'end_turn' }), {
      state: 'idle',
      stopReason: 'end_turn',
    });
    assert.deepStrictEqual(parseSubagentWorkState({ state: 'mystery' }), { state: 'mystery' });
    assert.strictEqual(parseSubagentWorkState(42), undefined);
  });

  it('treats completed and idle as finished', () => {
    assert.isTrue(isSubagentFinished({ state: 'completed' }));
    assert.isTrue(isSubagentFinished({ state: 'idle' }));
    assert.isFalse(isSubagentFinished({ state: 'running' }));
    assert.isFalse(isSubagentFinished(undefined));
  });
});

describe('applySubagentPatch', () => {
  it('applies the captured spawn then state update', () => {
    const [spawn, , done] = fixture;
    const spawned = applySubagentPatch(child(), spawn.update);
    assert.strictEqual(spawned.name, 'Reply alpha');
    assert.deepStrictEqual(spawned.capabilities, {});
    assert.isFalse(canCancelSubagent(spawned));
    const finished = applySubagentPatch(spawned, done.update);
    assert.deepStrictEqual(finished.state, { state: 'completed' });
    assert.strictEqual(finished.name, 'Reply alpha');
  });

  it('omit = unchanged, null = clear, concrete = replace whole', () => {
    const base = applySubagentPatch(child(), { capabilities: { cancel: {} }, name: 'A', state: 'running' });
    assert.isTrue(canCancelSubagent(base));
    const unchanged = applySubagentPatch(base, {});
    assert.deepStrictEqual(unchanged, base);
    const cleared = applySubagentPatch(base, { capabilities: null, name: null });
    assert.isUndefined(cleared.capabilities);
    assert.isUndefined(cleared.name);
    const replaced = applySubagentPatch(base, { capabilities: { other: {} } });
    assert.isFalse(canCancelSubagent(replaced));
    assert.isFalse(canCancelSubagent(applySubagentPatch(base, { capabilities: { cancel: null } })));
  });

  it('flags needs-input from requires_action', () => {
    assert.isTrue(subagentNeedsInput(applySubagentPatch(child(), { state: { state: 'requires_action' } })));
  });
});

describe('child transcript', () => {
  it('reduces child updates and reports latest activity', () => {
    const next = reduceSubagentTranscriptUpdate(child(), fixtureMessage.update);
    assert.strictEqual(subagentLatestActivity(next), 'alpha');
    assert.strictEqual(reduceSubagentTranscriptUpdate(next, { sessionUpdate: 'unknown_kind' }), next);
  });

  it('upserts the parent row once per child', () => {
    const once = upsertSubagentRow(emptySessionTranscript(), 'c1');
    assert.strictEqual(upsertSubagentRow(once, 'c1'), once);
    assert.strictEqual(once.items.length, 1);
  });
});

describe('inter-session messages', () => {
  it('upserts by messageId and appends chunks', () => {
    let t = reduceSessionUpdate(emptySessionTranscript(), {
      content: { text: 'hi', type: 'text' },
      messageId: 'm1',
      recipientSessionId: 'c1',
      sessionUpdate: 'session_message',
      senderSessionId: 'p1',
    });
    t = reduceSessionUpdate(t, {
      content: { text: ' there', type: 'text' },
      messageId: 'm1',
      sessionUpdate: 'session_message_chunk',
    });
    assert.strictEqual(t.items.length, 1);
    const [item] = t.items;
    assert.strictEqual(item.kind, 'inter_session_message');
    if (item.kind === 'inter_session_message') {
      assert.strictEqual(item.text, 'hi there');
      assert.strictEqual(item.recipientSessionId, 'c1');
    }
  });

  it('drops conflicting cross-transcript refs', () => {
    let t = reduceSessionUpdate(emptySessionTranscript(), {
      content: { text: 'x', type: 'text' },
      messageId: 'm1',
      senderMessageId: 'a',
      sessionUpdate: 'session_message',
    });
    t = reduceSessionUpdate(t, { messageId: 'm1', senderMessageId: 'b', sessionUpdate: 'session_message' });
    const [item] = t.items;
    assert.isTrue(item.kind === 'inter_session_message' && item.senderMessageId === undefined);
  });
});

describe('rootAncestorId', () => {
  it('walks to the root and survives cycles', () => {
    const a = initialSubagentSnapshot('a', 'root');
    const b = initialSubagentSnapshot('b', 'a');
    assert.strictEqual(rootAncestorId({ a, b }, 'b'), 'root');
    const x = initialSubagentSnapshot('x', 'y');
    const y = initialSubagentSnapshot('y', 'x');
    assert.isString(rootAncestorId({ x, y }, 'x'));
  });
});

describe('resetSubagentLiveState', () => {
  it('keeps terminal states, clears the rest as unconfirmed', () => {
    const done = applySubagentPatch(child(), { capabilities: { cancel: {} }, state: 'completed' });
    const keptDone = resetSubagentLiveState(done);
    assert.deepStrictEqual(keptDone.state, { state: 'completed' });
    assert.isUndefined(keptDone.capabilities);
    assert.isUndefined(keptDone.stateUnconfirmed);
    const cancelled = resetSubagentLiveState(applySubagentPatch(child(), { state: 'cancelled' }));
    assert.deepStrictEqual(cancelled.state, { state: 'cancelled' });
    for (const state of ['running', 'idle', 'requires_action', 'mystery']) {
      const reset = resetSubagentLiveState(applySubagentPatch(child(), { state }));
      assert.isUndefined(reset.state);
      assert.isTrue(reset.stateUnconfirmed);
    }
    const revived = applySubagentPatch(resetSubagentLiveState(applySubagentPatch(child(), { state: 'running' })), {
      state: 'completed',
    });
    assert.isUndefined(revived.stateUnconfirmed);
  });
});
