import { assert, describe, it } from '@effect/vitest';

import {
  initialBackendHarnessSnapshot,
  initialSessionSnapshot,
  normalizeSessionHistory,
} from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot, SessionSnapshot } from './acpSessionBootstrap.ts';
import {
  beginClientRequest,
  beginPromptTurn,
  dropSession,
  endClientRequest,
  endPromptTurn,
  excludeBoundVirtualFromHistory,
  markHistoryUnavailable,
  markSessionInactive,
  mergeListedHistory,
  reconcileConnectionLost,
  replaceSessionHistory,
  stripSessionPendings,
  upsertIntoSnapshot,
} from './harnessStateTransitions.ts';

describe('mergeListedHistory', () => {
  const current = [
    { cwd: '/a', sessionId: 'a' },
    { cwd: '/b', sessionId: 'b' },
  ];
  it('replaces unscoped results, including empty results', () => {
    assert.deepStrictEqual(mergeListedHistory(current, [{ cwd: '/c', sessionId: 'c' }], { _tag: 'Unscoped' }), [
      { cwd: '/c', sessionId: 'c' },
    ]);
    assert.deepStrictEqual(mergeListedHistory(current, [], { _tag: 'Unscoped' }), []);
  });
  it('replaces only matching cwd and preserves Skip', () => {
    assert.deepStrictEqual(mergeListedHistory(current, [{ cwd: '/a', sessionId: 'c' }], { _tag: 'Cwd', cwd: '/a' }), [
      { cwd: '/b', sessionId: 'b' },
      { cwd: '/a', sessionId: 'c' },
    ]);
    assert.deepStrictEqual(mergeListedHistory(current, [], { _tag: 'Skip' }), current);
  });
  it('marks hydrated entries unavailable', () => {
    assert.deepStrictEqual(
      markHistoryUnavailable(current),
      current.map(entry => ({ ...entry, unavailable: true })),
    );
  });
});

const readySnapshot = (sessions: Readonly<Record<string, SessionSnapshot>> = {}): BackendHarnessSnapshot => ({
  ...initialBackendHarnessSnapshot(),
  phase: 'ready',
  sessions,
});

const activeSession = (sessionId: string, overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  ...initialSessionSnapshot(sessionId, 'active'),
  ...overrides,
  sessionId,
});

describe('beginClientRequest', () => {
  it('rejects when backend is not ready', () => {
    const snapshot: BackendHarnessSnapshot = {
      ...readySnapshot({ s1: activeSession('s1') }),
      phase: 'connecting',
    };
    assert.isUndefined(beginClientRequest(snapshot, 's1', 'prompt'));
  });

  it('rejects when session is inactive', () => {
    const snapshot = readySnapshot({ s1: initialSessionSnapshot('s1', 'inactive') });
    assert.isUndefined(beginClientRequest(snapshot, 's1', 'prompt'));
  });

  it('rejects when a pending client request exists', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1', { pendingClientRequest: 'config' }) });
    assert.isUndefined(beginClientRequest(snapshot, 's1', 'prompt'));
  });

  it('rejects when pending elicitation exists', () => {
    const snapshot = readySnapshot({
      s1: activeSession('s1', {
        pendingElicitation: {
          id: 'e1',
          request: {} as never,
          resolve: () => undefined,
          sessionId: 's1',
        },
      }),
    });
    assert.isUndefined(beginClientRequest(snapshot, 's1', 'prompt'));
  });

  it('accepts and sets pendingClientRequest kind', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const next = beginClientRequest(snapshot, 's1', 'prompt');
    assert.ok(next !== undefined);
    assert.strictEqual(next.sessions.s1.pendingClientRequest, 'prompt');
  });
});

describe('endClientRequest', () => {
  it('clears pendingClientRequest and promptCancelRequested', () => {
    const snapshot = readySnapshot({
      s1: activeSession('s1', { pendingClientRequest: 'prompt', promptCancelRequested: true }),
    });
    const next = endClientRequest(snapshot, 's1');
    assert.isUndefined(next.sessions.s1.pendingClientRequest);
    assert.isUndefined(next.sessions.s1.promptCancelRequested);
  });

  it('leaves a Session that is no longer in the map dropped', () => {
    const snapshot = readySnapshot();
    assert.strictEqual(endClientRequest(snapshot, 's1'), snapshot);
  });
});

describe('beginPromptTurn', () => {
  it('refuses with the decided action when Bootstrap is not usable', () => {
    const snapshot: BackendHarnessSnapshot = { ...readySnapshot({ s1: activeSession('s1') }), phase: 'initialized' };
    assert.deepStrictEqual(beginPromptTurn(snapshot, 's1', { startedAt: 1, text: 'hi' }), {
      _tag: 'Refused',
      action: { _tag: 'Unavailable', reason: 'NotReady' },
    });
  });

  it('refuses with CancelTurn while a prompt is in flight (a Send never sees Steer)', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1', { pendingClientRequest: 'prompt' }) });
    assert.deepStrictEqual(beginPromptTurn(snapshot, 's1', { startedAt: 1, text: 'hi' }), {
      _tag: 'Refused',
      action: { _tag: 'CancelTurn' },
    });
  });

  it('refuses an empty prompt', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    assert.deepStrictEqual(beginPromptTurn(snapshot, 's1', { startedAt: 1, text: '' }), {
      _tag: 'Refused',
      action: { _tag: 'Unavailable', reason: 'Empty' },
    });
  });

  it('sets the Pending client request and appends the user message stamped startedAt', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const begun = beginPromptTurn(snapshot, 's1', { startedAt: 42, text: 'hello' });
    assert.strictEqual(begun._tag, 'Begun');
    if (begun._tag !== 'Begun') return;
    const session = begun.snapshot.sessions.s1;
    assert.strictEqual(session.pendingClientRequest, 'prompt');
    assert.deepStrictEqual(session.transcript.items, [
      { id: begun.turnId, kind: 'user_message', startedAt: 42, text: 'hello' },
    ]);
  });
});

describe('endPromptTurn', () => {
  it('clears the request and Prompt turn cancel, and stamps endedAt only on its own turn', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const first = beginPromptTurn(snapshot, 's1', { startedAt: 1, text: 'one' });
    assert.strictEqual(first._tag, 'Begun');
    if (first._tag !== 'Begun') return;
    const ended = endPromptTurn(first.snapshot, 's1', first.turnId, 5);
    const second = beginPromptTurn(ended, 's1', { startedAt: 6, text: 'two' });
    assert.strictEqual(second._tag, 'Begun');
    if (second._tag !== 'Begun') return;
    const cancelling: BackendHarnessSnapshot = {
      ...second.snapshot,
      sessions: { s1: { ...second.snapshot.sessions.s1, promptCancelRequested: true } },
    };
    const next = endPromptTurn(cancelling, 's1', second.turnId, 9).sessions.s1;
    assert.isUndefined(next.pendingClientRequest);
    assert.isUndefined(next.promptCancelRequested);
    assert.deepStrictEqual(
      next.transcript.items.map(item => (item.kind === 'user_message' ? [item.startedAt, item.endedAt] : [])),
      [
        [1, 5],
        [6, 9],
      ],
    );
  });

  it('leaves a Session that is no longer in the map dropped', () => {
    const snapshot = readySnapshot();
    assert.strictEqual(endPromptTurn(snapshot, 's1', 'turn', 9), snapshot);
  });
});

describe('stripSessionPendings', () => {
  it('only clears pendings on listed session ids', () => {
    const snapshot = readySnapshot({
      s1: activeSession('s1', { pendingClientRequest: 'prompt' }),
      s2: activeSession('s2', { pendingClientRequest: 'config' }),
    });
    const next = stripSessionPendings(snapshot, ['s1']);
    assert.isUndefined(next.sessions.s1.pendingClientRequest);
    assert.strictEqual(next.sessions.s2.pendingClientRequest, 'config');
  });
});

describe('markSessionInactive', () => {
  it('sets status inactive', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const next = markSessionInactive(snapshot, 's1');
    assert.strictEqual(next.sessions.s1.status, 'inactive');
  });
  it('clears pending client request but keeps prompt cancel flag', () => {
    const snapshot = readySnapshot({
      s1: activeSession('s1', { pendingClientRequest: 'prompt', promptCancelRequested: true }),
    });
    const next = markSessionInactive(snapshot, 's1');
    assert.isUndefined(next.sessions.s1.pendingClientRequest);
    assert.isTrue(next.sessions.s1.promptCancelRequested);
  });
});

describe('dropSession', () => {
  it('removes session and history row', () => {
    const snapshot: BackendHarnessSnapshot = {
      ...readySnapshot({ s1: activeSession('s1'), s2: activeSession('s2') }),
      sessionHistory: [
        { cwd: '/a', sessionId: 's1' },
        { cwd: '/b', sessionId: 's2' },
      ],
    };
    const next = dropSession(snapshot, 's1');
    assert.isUndefined(next.sessions.s1);
    assert.isDefined(next.sessions.s2);
    assert.deepStrictEqual(
      next.sessionHistory.map(entry => entry.sessionId),
      ['s2'],
    );
  });
});

describe('upsertIntoSnapshot', () => {
  it('upserts session and optional history entry', () => {
    const session = activeSession('s1', { cwd: '/proj' });
    const historyEntry = { cwd: '/proj', sessionId: 's1', title: 'T' };
    const next = upsertIntoSnapshot(readySnapshot(), { historyEntry, session });
    assert.strictEqual(next.sessions.s1.cwd, '/proj');
    assert.strictEqual(next.sessionHistory[0]?.sessionId, 's1');
    assert.strictEqual(next.sessionHistory[0]?.title, 'T');
  });

  it('upserts history entry alone', () => {
    const historyEntry = { cwd: '/proj', sessionId: 's1' };
    const next = upsertIntoSnapshot(readySnapshot(), { historyEntry });
    assert.strictEqual(Object.keys(next.sessions).length, 0);
    assert.strictEqual(next.sessionHistory[0]?.sessionId, 's1');
  });
});

describe('replaceSessionHistory', () => {
  it('replaces history only', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const next = replaceSessionHistory(snapshot, [{ cwd: '/x', sessionId: 's9' }]);
    assert.strictEqual(next.sessions.s1.sessionId, 's1');
    assert.deepStrictEqual(next.sessionHistory, [{ cwd: '/x', sessionId: 's9' }]);
  });
});

describe('reconcileConnectionLost', () => {
  const pending = (): {
    snapshot: BackendHarnessSnapshot;
    elicitation: unknown[];
    permission: unknown[];
  } => {
    const permission: unknown[] = [];
    const elicitation: unknown[] = [];
    const withPendings = activeSession('s1', {
      pendingElicitation: {
        id: 'e1',
        request: {} as never,
        resolve: response => {
          elicitation.push(response);
        },
        sessionId: 's1',
      },
      pendingPermission: {
        request: {} as never,
        resolve: response => {
          permission.push(response);
        },
        sessionId: 's1',
      },
    });
    return {
      elicitation,
      permission,
      snapshot: {
        ...readySnapshot({ s1: withPendings, s2: initialSessionSnapshot('s2', 'activating') }),
        rpcCalls: [{ direction: 'in', id: 'r', message: {}, receivedAt: 1 }],
        sessionHistory: [{ cwd: '/a', sessionId: 's1' }],
      },
    };
  };

  it('marks every session inactive, drops pendings, keeps transcripts and the wire log, marks history unavailable', () => {
    const { snapshot } = pending();
    const reconciled = reconcileConnectionLost(snapshot);
    assert.deepStrictEqual(
      Object.values(reconciled.sessions).map(session => [session.sessionId, session.status]),
      [
        ['s1', 'inactive'],
        ['s2', 'inactive'],
      ],
    );
    assert.isUndefined(reconciled.sessions.s1.pendingPermission);
    assert.isUndefined(reconciled.sessions.s1.pendingElicitation);
    assert.deepStrictEqual(reconciled.sessions.s1.transcript, snapshot.sessions.s1.transcript);
    assert.deepStrictEqual(reconciled.sessionHistory, [{ cwd: '/a', sessionId: 's1', unavailable: true }]);
    assert.strictEqual(reconciled.phase, 'connecting');
    assert.deepStrictEqual(reconciled.rpcCalls, [{ direction: 'in', id: 'r', message: {}, receivedAt: 1 }]);
    assert.isUndefined(reconciled.antigravityAuthUrl);
    assert.isUndefined(reconciled.failure);
  });

  it('clears a stale error and is idempotent', () => {
    const snapshot: BackendHarnessSnapshot = {
      ...readySnapshot({ s1: activeSession('s1') }),
      antigravityAuthUrl: 'https://auth.example',
      failure: { _tag: 'Failed', message: 'boom' },
      phase: 'error',
      rpcCalls: [{ direction: 'out', id: 'r', message: {}, receivedAt: 1 }],
    };
    const once = reconcileConnectionLost(snapshot);
    assert.strictEqual(once.phase, 'connecting');
    assert.isUndefined(once.failure);
    assert.isUndefined(once.antigravityAuthUrl);
    assert.strictEqual(once.sessions.s1.status, 'inactive');
    assert.deepStrictEqual(once.rpcCalls, [{ direction: 'out', id: 'r', message: {}, receivedAt: 1 }]);
    assert.deepStrictEqual(reconcileConnectionLost(once), once);
  });
});

describe('excludeBoundVirtualFromHistory', () => {
  it('filters the Bound id; normalizeSessionHistory still returns it', () => {
    const normalized = normalizeSessionHistory({
      sessions: [
        { cwd: '/proj', sessionId: 'bound-1' },
        { cwd: '/other', sessionId: 'real-1' },
      ],
    });
    assert.strictEqual(normalized.length, 2);
    assert.deepStrictEqual(
      excludeBoundVirtualFromHistory(normalized, 'bound-1').map(entry => entry.sessionId),
      ['real-1'],
    );
  });
});
