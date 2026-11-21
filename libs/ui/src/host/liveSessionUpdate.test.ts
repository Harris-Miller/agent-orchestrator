import { assert, describe, it } from '@effect/vitest';

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { NormalizedSessionInfo, SessionSnapshot } from './acpSessionBootstrap.ts';
import { applyLiveSessionUpdate } from './harnessStateTransitions.ts';
import { configValue } from './sessionConfiguration.ts';
import { emptySessionTranscript } from './sessionUpdateReducer.ts';

const emptyHistory: readonly NormalizedSessionInfo[] = [];

/** A root-session update through `applyLiveSessionUpdate`, read back as the Session (and History row) it changed. */
const foldRootUpdate = (
  session: SessionSnapshot | undefined,
  sessionId: string,
  history: readonly NormalizedSessionInfo[],
  update: unknown,
) => {
  const before = {
    ...initialBackendHarnessSnapshot(),
    sessionHistory: history,
    sessions: session === undefined ? {} : { [sessionId]: session },
  };
  const { snapshot } = applyLiveSessionUpdate(before, sessionId, update);
  return snapshot === before
    ? ({ kind: 'noop' } as const)
    : ({
        kind: 'patch',
        session: snapshot.sessions[sessionId],
        sessionHistory: snapshot.sessionHistory === before.sessionHistory ? undefined : snapshot.sessionHistory,
      } as const);
};

const replayEnd = {
  _meta: { jetbrains: { air: { loadReplayEnd: true, version: 1 } } },
  sessionUpdate: 'session_info_update',
};

describe('applyLiveSessionUpdate on a root Session', () => {
  it('loadReplayEnd marks an activating session replayComplete', () => {
    const result = foldRootUpdate(initialSessionSnapshot('s1', 'activating'), 's1', emptyHistory, replayEnd);
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.session.replayComplete, true);
      assert.strictEqual(result.sessionHistory, undefined);
    }
  });

  it('loadReplayEnd is a noop on active and inactive sessions', () => {
    for (const status of ['active', 'inactive'] as const) {
      const result = foldRootUpdate(initialSessionSnapshot('s1', status), 's1', emptyHistory, replayEnd);
      assert.strictEqual(result.kind, 'noop');
    }
  });

  it('a titled session_info_update does not set replayComplete', () => {
    const result = foldRootUpdate(initialSessionSnapshot('s1', 'activating'), 's1', emptyHistory, {
      sessionUpdate: 'session_info_update',
      title: 'x',
    });
    assert.notStrictEqual(result.kind === 'patch' ? result.session.replayComplete : undefined, true);
  });

  it('returns noop for unrecognized updates with no side effects', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldRootUpdate(session, 's1', emptyHistory, { sessionUpdate: 'unknown_kind' });
    assert.strictEqual(result.kind, 'noop');
  });

  it('patches transcript for chat-mutating updates', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldRootUpdate(session, 's1', emptyHistory, {
      content: { text: 'hello', type: 'text' },
      sessionUpdate: 'agent_message_chunk',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.sessionHistory, undefined);
      assert.strictEqual(result.session.transcript.items.length, 1);
      assert.strictEqual(result.session.transcript.items[0]?.kind, 'agent_message');
    }
  });

  it('sets availableCommands for available_commands_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldRootUpdate(session, 's1', emptyHistory, {
      availableCommands: [{ description: 'Run tests', isSkill: false, name: 'test' }],
      sessionUpdate: 'available_commands_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(result.session.availableCommands, [
        { description: 'Run tests', isSkill: false, name: 'test' },
      ]);
    }
  });

  it('sets usage for usage_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldRootUpdate(session, 's1', emptyHistory, {
      cost: { amount: 0.01, currency: 'USD' },
      sessionUpdate: 'usage_update',
      size: 100,
      used: 10,
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(result.session.usage, {
        cost: { amount: 0.01, currency: 'USD' },
        size: 100,
        used: 10,
      });
    }
  });

  it('returns noop for malformed usage_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldRootUpdate(session, 's1', emptyHistory, {
      sessionUpdate: 'usage_update',
      size: 100,
    });
    assert.strictEqual(result.kind, 'noop');
  });

  it('applies config_option_update onto session configuration without adding a chat item', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldRootUpdate(session, 's1', emptyHistory, {
      configOptions: [
        {
          currentValue: 'code',
          id: 'mode',
          name: 'Mode',
          options: [
            { name: 'Ask', value: 'ask' },
            { name: 'Code', value: 'code' },
          ],
          type: 'select',
        },
      ],
      sessionUpdate: 'config_option_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(configValue(result.session.configuration, 'mode'), 'code');
      assert.deepStrictEqual(result.session.transcript.items, []);
    }
  });

  it('applies config while activating', () => {
    const session = initialSessionSnapshot('s1', 'activating');
    const result = foldRootUpdate(session, 's1', emptyHistory, {
      configOptions: [{ currentValue: 'ask', id: 'mode', name: 'Mode', options: [{ value: 'ask' }], type: 'select' }],
      sessionUpdate: 'config_option_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(configValue(result.session.configuration, 'mode'), 'ask');
    }
  });

  it('patches history title for session_info_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const history: readonly NormalizedSessionInfo[] = [{ cwd: '/proj', sessionId: 's1', title: 'Old' }];
    const result = foldRootUpdate(session, 's1', history, {
      sessionUpdate: 'session_info_update',
      title: 'New title',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(result.sessionHistory, [{ cwd: '/proj', sessionId: 's1', title: 'New title' }]);
      assert.strictEqual(result.session.transcript, session.transcript);
    }
  });

  it('patches history updatedAt for session_info_update', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const history: readonly NormalizedSessionInfo[] = [{ cwd: '/proj', sessionId: 's1', title: 'Old' }];
    const result = foldRootUpdate(session, 's1', history, {
      sessionUpdate: 'session_info_update',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(result.sessionHistory, [
        { cwd: '/proj', sessionId: 's1', title: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' },
      ]);
    }
  });

  it('session_info_update only advances history updatedAt', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const history: readonly NormalizedSessionInfo[] = [
      { cwd: '/proj', sessionId: 's1', updatedAt: '2026-01-02T00:00:00.000Z' },
    ];
    const older = foldRootUpdate(session, 's1', history, {
      sessionUpdate: 'session_info_update',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    if (older.kind === 'patch') {
      assert.deepStrictEqual(older.sessionHistory ?? history, history);
    }
    const newer = foldRootUpdate(session, 's1', history, {
      sessionUpdate: 'session_info_update',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
    assert.strictEqual(newer.kind, 'patch');
    if (newer.kind === 'patch') {
      assert.strictEqual(newer.sessionHistory?.[0].updatedAt, '2026-01-03T00:00:00.000Z');
    }
  });

  it('patches both title and updatedAt when session_info_update carries both', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const history: readonly NormalizedSessionInfo[] = [{ cwd: '/proj', sessionId: 's1', title: 'Old' }];
    const result = foldRootUpdate(session, 's1', history, {
      sessionUpdate: 'session_info_update',
      title: 'New',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(result.sessionHistory, [
        { cwd: '/proj', sessionId: 's1', title: 'New', updatedAt: '2026-01-01T00:00:00.000Z' },
      ]);
    }
  });

  it('session_info_update with neither title nor updatedAt is a noop', () => {
    const result = foldRootUpdate(initialSessionSnapshot('s1', 'active'), 's1', emptyHistory, {
      sessionUpdate: 'session_info_update',
    });
    assert.strictEqual(result.kind, 'noop');
  });

  it('patches the transcript with a session failure row', () => {
    const session = initialSessionSnapshot('s1', 'active');
    const result = foldRootUpdate(session, 's1', emptyHistory, {
      _meta: {
        jetbrains: {
          air: {
            sessionFailure: { actions: [], category: 'service', id: 'f1', revision: 1, severity: 'error', title: 'T' },
          },
        },
      },
      sessionUpdate: 'session_info_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.session.transcript.items[0]?.kind, 'session_failure');
    }
  });

  it('flags skill commands from AIR meta', () => {
    const result = foldRootUpdate(undefined, 's1', emptyHistory, {
      availableCommands: [{ _meta: { jetbrains: { air: { kind: 'skill' } } }, name: 'caveman' }, { name: 'status' }],
      sessionUpdate: 'available_commands_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(
        result.session.availableCommands?.map(c => [c.name, c.isSkill]),
        [
          ['caveman', true],
          ['status', false],
        ],
      );
    }
  });

  it('seeds initialSessionSnapshot when session is undefined', () => {
    const result = foldRootUpdate(undefined, 's1', emptyHistory, {
      availableCommands: [{ isSkill: false, name: 'help' }],
      sessionUpdate: 'available_commands_update',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.strictEqual(result.session.sessionId, 's1');
      assert.strictEqual(result.session.status, 'inactive');
      assert.deepStrictEqual(result.session.availableCommands, [
        { description: undefined, isSkill: false, name: 'help' },
      ]);
    }
  });

  it('folds transcript from empty when session is undefined', () => {
    const result = foldRootUpdate(undefined, 's1', emptyHistory, {
      content: { text: 'hi', type: 'text' },
      sessionUpdate: 'user_message_chunk',
    });
    assert.strictEqual(result.kind, 'patch');
    if (result.kind === 'patch') {
      assert.deepStrictEqual(result.session.transcript.items[0], {
        id: result.session.transcript.items[0]?.id,
        kind: 'user_message',
        text: 'hi',
      });
      assert.notStrictEqual(result.session.transcript, emptySessionTranscript());
    }
  });
});

const withHistory = (sessionHistory: readonly NormalizedSessionInfo[]) => ({
  ...initialBackendHarnessSnapshot(),
  sessionHistory,
  sessions: { s1: initialSessionSnapshot('s1', 'active') },
});

describe('applyLiveSessionUpdate on the History row', () => {
  it('upserts the patched Session and keeps the History when the update carried no retitle', () => {
    const snapshot = withHistory([{ cwd: '/proj', sessionId: 's1' }]);
    const { snapshot: next } = applyLiveSessionUpdate(snapshot, 's1', {
      content: { text: 'hi', type: 'text' },
      sessionUpdate: 'agent_message_chunk',
    });
    assert.lengthOf(next.sessions.s1.transcript.items, 1);
    assert.strictEqual(next.sessionHistory, snapshot.sessionHistory);
  });

  it('retitles the History row when the update carried a title', () => {
    const snapshot = withHistory([{ cwd: '/proj', sessionId: 's1' }]);
    const { snapshot: next } = applyLiveSessionUpdate(snapshot, 's1', {
      sessionUpdate: 'session_info_update',
      title: 'New',
    });
    assert.strictEqual(next.sessionHistory[0]?.title, 'New');
  });
});
