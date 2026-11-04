import { assert, describe, it } from '@effect/vitest';

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot, SessionSnapshot } from './acpSessionBootstrap.ts';
import {
  beginClientRequest,
  cancelPendingRequests,
  dropSession,
  endClientRequest,
  markHistoryUnavailable,
  markSessionInactive,
  mergeListedHistory,
  reconcileStoppedProvider,
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

describe('stopped provider reconcile', () => {
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

  it('cancels outstanding permission and elicitation requests', () => {
    const { elicitation, permission, snapshot } = pending();
    cancelPendingRequests(snapshot);
    assert.deepStrictEqual(permission, [{ outcome: { outcome: 'cancelled' } }]);
    assert.deepStrictEqual(elicitation, [{ action: 'cancel' }]);
  });

  it('marks every session inactive, drops pendings, keeps transcripts and marks history unavailable', () => {
    const { snapshot } = pending();
    const reconciled = reconcileStoppedProvider(snapshot);
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
    assert.deepStrictEqual(reconciled.rpcCalls, []);
    assert.isUndefined(reconciled.antigravityAuthUrl);
    assert.isUndefined(reconciled.failure);
  });
});
