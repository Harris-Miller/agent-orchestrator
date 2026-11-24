import { assert, describe, it } from '@effect/vitest';
import { Option } from 'effect';

import { harness, session, subagent } from './harnessSnapshot.testing.ts';
import fixture from '../../fixtures/claude_subagent_session_updates.json' with { type: 'json' };

import {
  applySubagentPatch,
  canCancelSubagent,
  decodeSubagentUpdate,
  hasBackgroundActivity,
  initialSubagentSnapshot,
  isSubagentFinished,
  reduceSubagentTranscriptUpdate,
  resetSubagentLiveState,
  rootAncestorId,
  sessionHasLiveWork,
  subagentAncestry,
  subagentLatestActivity,
  subagentLaunchTarget,
  subagentNeedsInput,
  subagentRollUp,
} from './subagent.ts';
import type { SubagentSnapshot } from './subagent.ts';
import { emptySessionTranscript, reduceSessionUpdate, upsertSubagentChatItem } from './sessionUpdateReducer.ts';

const [, fixtureMessage] = fixture;
const child = (): SubagentSnapshot => initialSubagentSnapshot('c1', 'p1');

const patchChild = (current: ReturnType<typeof child>, fields: object) =>
  applySubagentPatch(
    current,
    decodeSubagentUpdate({ sessionUpdate: 'subagent_update', subagentSessionId: 'c1', ...fields }).pipe(
      Option.getOrThrow,
    ),
  );

describe('subagent work state', () => {
  it('maps string and object states to a work state', () => {
    assert.deepStrictEqual(patchChild(child(), { state: 'completed' }).state, { state: 'completed' });
    assert.deepStrictEqual(patchChild(child(), { state: { state: 'idle', stopReason: 'end_turn' } }).state, {
      state: 'idle',
      stopReason: 'end_turn',
    });
    assert.deepStrictEqual(patchChild(child(), { state: { state: 'mystery' } }).state, { state: 'mystery' });
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
    const spawned = patchChild(child(), spawn.update);
    assert.strictEqual(spawned.name, 'Reply alpha');
    assert.deepStrictEqual(spawned.capabilities, {});
    assert.isFalse(canCancelSubagent(spawned));
    const finished = patchChild(spawned, done.update);
    assert.deepStrictEqual(finished.state, { state: 'completed' });
    assert.strictEqual(finished.name, 'Reply alpha');
  });

  it('omit = unchanged, null = clear, concrete = replace whole', () => {
    const base = patchChild(child(), { capabilities: { cancel: {} }, name: 'A', state: 'running' });
    assert.isTrue(canCancelSubagent(base));
    const unchanged = patchChild(base, {});
    assert.deepStrictEqual(unchanged, base);
    const cleared = patchChild(base, { capabilities: null, name: null });
    assert.isUndefined(cleared.capabilities);
    assert.isUndefined(cleared.name);
    const replaced = patchChild(base, { capabilities: { other: {} } });
    assert.isFalse(canCancelSubagent(replaced));
    assert.isFalse(canCancelSubagent(patchChild(base, { capabilities: { cancel: null } })));
  });

  it('flags needs-input from requires_action', () => {
    assert.isTrue(subagentNeedsInput(patchChild(child(), { state: { state: 'requires_action' } })));
  });
});

describe('child transcript', () => {
  it('reduces child updates and reports latest activity', () => {
    const next = reduceSubagentTranscriptUpdate(child(), fixtureMessage.update);
    assert.strictEqual(subagentLatestActivity(next), 'alpha');
    assert.strictEqual(reduceSubagentTranscriptUpdate(next, { sessionUpdate: 'unknown_kind' }), next);
  });

  it('upserts the parent row once per child', () => {
    const once = upsertSubagentChatItem(emptySessionTranscript(), 'c1');
    assert.strictEqual(upsertSubagentChatItem(once, 'c1'), once);
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
    const done = patchChild(child(), { capabilities: { cancel: {} }, state: 'completed' });
    const keptDone = resetSubagentLiveState(done);
    assert.deepStrictEqual(keptDone.state, { state: 'completed' });
    assert.isUndefined(keptDone.capabilities);
    assert.isUndefined(keptDone.stateUnconfirmed);
    const cancelled = resetSubagentLiveState(patchChild(child(), { state: 'cancelled' }));
    assert.deepStrictEqual(cancelled.state, { state: 'cancelled' });
    for (const state of ['running', 'idle', 'requires_action', 'mystery']) {
      const reset = resetSubagentLiveState(patchChild(child(), { state }));
      assert.isUndefined(reset.state);
      assert.isTrue(reset.stateUnconfirmed);
    }
    const revived = patchChild(resetSubagentLiveState(patchChild(child(), { state: 'running' })), {
      state: 'completed',
    });
    assert.isUndefined(revived.stateUnconfirmed);
  });
});

describe('sessionHasLiveWork', () => {
  const running = { state: { state: 'running' } } as const;

  it('is true for a Prompt turn in flight or Background follow-up, false when idle', () => {
    const turn = { ...session('a'), pendingClientRequest: 'prompt' } as const;
    assert.isTrue(sessionHasLiveWork(harness([turn]), turn));
    const background = harness([session('a')], [subagent('c', 'a', running)]);
    assert.isTrue(sessionHasLiveWork(background, background.sessions.a));
    const idle = harness([session('a')]);
    assert.isFalse(sessionHasLiveWork(idle, idle.sessions.a));
  });
});

describe('hasBackgroundActivity', () => {
  const running = { state: { state: 'running' } } as const;

  it('is true for an idle active Session with a running native Subagent', () => {
    assert.isTrue(hasBackgroundActivity(harness([session('a')], [subagent('c', 'a', running)]), 'a'));
  });

  it('counts a requires_action or nested running descendant', () => {
    assert.isTrue(
      hasBackgroundActivity(
        harness([session('a')], [subagent('c', 'a', { state: { state: 'requires_action' } })]),
        'a',
      ),
    );
    assert.isTrue(
      hasBackgroundActivity(
        harness([session('a')], [subagent('c', 'a', { state: { state: 'completed' } }), subagent('g', 'c', running)]),
        'a',
      ),
    );
  });

  it('counts a running Spawned subagent, also nested below a native or finished one (#277)', () => {
    const spawned = (id: string, parent: string, fields: object) => ({
      ...subagent(id, parent, fields),
      kind: 'spawned' as const,
      launchTarget: 'codex-acp' as const,
    });
    assert.isTrue(hasBackgroundActivity(harness([session('a')], [spawned('c', 'a', running)]), 'a'));
    assert.isTrue(
      hasBackgroundActivity(
        harness([session('a')], [spawned('c', 'a', { state: { state: 'completed' } }), spawned('g', 'c', running)]),
        'a',
      ),
    );
  });

  it('is false with no Subagents, finished or unconfirmed Subagents', () => {
    assert.isFalse(hasBackgroundActivity(harness([session('a')]), 'a'));
    assert.isFalse(
      hasBackgroundActivity(harness([session('a')], [subagent('c', 'a', { state: { state: 'idle' } })]), 'a'),
    );
    assert.isFalse(
      hasBackgroundActivity(harness([session('a')], [subagent('c', 'a', { stateUnconfirmed: true })]), 'a'),
    );
  });

  it('is false while a Prompt turn is in flight, or for an inactive or unknown Session', () => {
    const children = [subagent('c', 'a', running)];
    assert.isFalse(hasBackgroundActivity(harness([session('a', { pendingClientRequest: 'prompt' })], children), 'a'));
    assert.isFalse(hasBackgroundActivity(harness([session('a', { status: 'inactive' })], children), 'a'));
    assert.isFalse(hasBackgroundActivity(harness([], children), 'a'));
  });

  it('is false for a Subagent of another Session', () => {
    assert.isFalse(hasBackgroundActivity(harness([session('a'), session('b')], [subagent('c', 'b', running)]), 'a'));
  });
});

describe('subagentLaunchTarget', () => {
  it('uses the spawned child own target, else the parent target', () => {
    const native = initialSubagentSnapshot('c1', 'p1');
    assert.strictEqual(subagentLaunchTarget(native, 'codex-acp'), 'codex-acp');
    assert.strictEqual(
      subagentLaunchTarget({ ...native, kind: 'spawned', launchTarget: 'claude-agent-acp' }, 'codex-acp'),
      'claude-agent-acp',
    );
  });
});

describe('nested subagent roll-up (#277)', () => {
  const tree = (fields: Record<string, object>) => ({
    a: subagent('a', 'root', fields.a ?? {}),
    b: subagent('b', 'a', fields.b ?? {}),
    c: subagent('c', 'b', fields.c ?? {}),
    other: subagent('other', 'root', fields.other ?? {}),
  });
  const running = { state: { state: 'running' } };

  it('counts working descendants at any depth, not the child itself or siblings', () => {
    const subagents = tree({ a: running, b: running, c: { state: { state: 'requires_action' } }, other: running });
    assert.deepStrictEqual(subagentRollUp(subagents, 'a'), { needsInput: true, running: 2 });
    assert.deepStrictEqual(subagentRollUp(subagents, 'b'), { needsInput: true, running: 1 });
    assert.deepStrictEqual(subagentRollUp(subagents, 'c'), { needsInput: false, running: 0 });
  });

  it('a Pending interaction below needs input even when its state is running', () => {
    const subagents = tree({ c: { ...running, pendingPermission: { request: {} } } });
    assert.isTrue(subagentRollUp(subagents, 'a').needsInput);
    assert.isFalse(subagentRollUp(tree({ c: running }), 'a').needsInput);
  });

  it('walks the ancestry outermost first, and survives a cycle', () => {
    const subagents = tree({});
    assert.deepStrictEqual(
      subagentAncestry(subagents, 'c').map(node => node.sessionId),
      ['a', 'b', 'c'],
    );
    assert.deepStrictEqual(subagentAncestry(subagents, 'missing'), []);
    const cyclic = { x: subagent('x', 'y'), y: subagent('y', 'x') };
    assert.lengthOf(subagentAncestry(cyclic, 'x'), 2);
  });
});
