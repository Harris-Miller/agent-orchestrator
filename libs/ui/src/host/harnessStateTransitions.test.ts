import { assert, describe, it } from '@effect/vitest';

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { BackendHarnessSnapshot, SessionSnapshot } from './acpSessionBootstrap.ts';
import {
  beginClientRequest,
  dropSession,
  endClientRequest,
  markRosterUnavailable,
  markSessionInactive,
  reconcileRoster,
  replaceSessionRoster,
  stripSessionPendings,
  upsertIntoSnapshot,
} from './harnessStateTransitions.ts';

describe('reconcileRoster', () => {
  const current = [
    { cwd: '/a', sessionId: 'a' },
    { cwd: '/b', sessionId: 'b' },
  ];
  it('replaces unscoped results, including empty results', () => {
    assert.deepStrictEqual(reconcileRoster(current, [{ cwd: '/c', sessionId: 'c' }], { _tag: 'Unscoped' }), [
      { cwd: '/c', sessionId: 'c' },
    ]);
    assert.deepStrictEqual(reconcileRoster(current, [], { _tag: 'Unscoped' }), []);
  });
  it('replaces only matching cwd and preserves Skip', () => {
    assert.deepStrictEqual(reconcileRoster(current, [{ cwd: '/a', sessionId: 'c' }], { _tag: 'Cwd', cwd: '/a' }), [
      { cwd: '/b', sessionId: 'b' },
      { cwd: '/a', sessionId: 'c' },
    ]);
    assert.deepStrictEqual(reconcileRoster(current, [], { _tag: 'Skip' }), current);
  });
  it('marks hydrated entries unavailable', () => {
    assert.deepStrictEqual(
      markRosterUnavailable(current),
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
});

describe('dropSession', () => {
  it('removes session and roster row', () => {
    const snapshot: BackendHarnessSnapshot = {
      ...readySnapshot({ s1: activeSession('s1'), s2: activeSession('s2') }),
      sessionRoster: [
        { cwd: '/a', sessionId: 's1' },
        { cwd: '/b', sessionId: 's2' },
      ],
    };
    const next = dropSession(snapshot, 's1');
    assert.isUndefined(next.sessions.s1);
    assert.isDefined(next.sessions.s2);
    assert.deepStrictEqual(
      next.sessionRoster.map(entry => entry.sessionId),
      ['s2'],
    );
  });
});

describe('upsertIntoSnapshot', () => {
  it('upserts session and optional roster entry', () => {
    const session = activeSession('s1', { cwd: '/proj' });
    const rosterEntry = { cwd: '/proj', sessionId: 's1', title: 'T' };
    const next = upsertIntoSnapshot(readySnapshot(), { rosterEntry, session });
    assert.strictEqual(next.sessions.s1.cwd, '/proj');
    assert.strictEqual(next.sessionRoster[0]?.sessionId, 's1');
    assert.strictEqual(next.sessionRoster[0]?.title, 'T');
  });

  it('upserts roster entry alone', () => {
    const rosterEntry = { cwd: '/proj', sessionId: 's1' };
    const next = upsertIntoSnapshot(readySnapshot(), { rosterEntry });
    assert.strictEqual(Object.keys(next.sessions).length, 0);
    assert.strictEqual(next.sessionRoster[0]?.sessionId, 's1');
  });
});

describe('replaceSessionRoster', () => {
  it('replaces roster only', () => {
    const snapshot = readySnapshot({ s1: activeSession('s1') });
    const next = replaceSessionRoster(snapshot, [{ cwd: '/x', sessionId: 's9' }]);
    assert.strictEqual(next.sessions.s1.sessionId, 's1');
    assert.deepStrictEqual(next.sessionRoster, [{ cwd: '/x', sessionId: 's9' }]);
  });
});
