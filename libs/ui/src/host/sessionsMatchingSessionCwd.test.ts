import { assert, describe, it } from '@effect/vitest';

import { firstFolderPath, sessionsMatchingSessionCwd } from './sessionsMatchingSessionCwd.ts';

const emptySnapshot = { sessionHistory: [], sessions: {} };

const never = () => false;

describe('sessionsMatchingSessionCwd', () => {
  it('matches active and activating by resolved cwd; skips inactive', () => {
    const getSnapshot = (launchTarget: 'claude-agent-acp' | 'codex-acp' | 'cursor-acp' | 'antigravity-acp') => {
      if (launchTarget !== 'codex-acp') {
        return emptySnapshot;
      }
      return {
        sessionHistory: [
          { cwd: '/ws', sessionId: 'a' },
          { cwd: '/ws', sessionId: 'b' },
          { cwd: '/ws', sessionId: 'c' },
          { cwd: '/other', sessionId: 'd' },
        ],
        sessions: {
          a: { cwd: '/ws', sessionId: 'a', status: 'active' as const },
          b: { cwd: '/ws', sessionId: 'b', status: 'activating' as const },
          c: { cwd: '/ws', sessionId: 'c', status: 'inactive' as const },
          d: { cwd: '/other', sessionId: 'd', status: 'active' as const },
        },
      };
    };

    const matches = sessionsMatchingSessionCwd(getSnapshot, '/ws', never);
    assert.deepStrictEqual(matches.map(m => m.sessionId).sort(), ['a', 'b']);
  });

  it('leaves out a Spawned subagent session: its parent deactivation ends it', () => {
    const getSnapshot = (launchTarget: 'claude-agent-acp' | 'codex-acp' | 'cursor-acp' | 'antigravity-acp') =>
      launchTarget === 'claude-agent-acp'
        ? {
            sessionHistory: [],
            sessions: {
              child: { cwd: '/ws', sessionId: 'child', status: 'active' as const },
              own: { cwd: '/ws', sessionId: 'own', status: 'active' as const },
            },
          }
        : emptySnapshot;

    const matches = sessionsMatchingSessionCwd(
      getSnapshot,
      '/ws',
      (launchTarget, sessionId) => launchTarget === 'claude-agent-acp' && sessionId === 'child',
    );
    assert.deepStrictEqual(
      matches.map(m => m.sessionId),
      ['own'],
    );
  });

  it('uses history cwd when snapshot cwd missing', () => {
    const getSnapshot = (launchTarget: 'claude-agent-acp' | 'codex-acp' | 'cursor-acp' | 'antigravity-acp') => {
      if (launchTarget !== 'codex-acp') {
        return emptySnapshot;
      }
      return {
        sessionHistory: [{ cwd: '/from-history', sessionId: 'a' }],
        sessions: {
          a: { sessionId: 'a', status: 'active' as const },
        },
      };
    };

    assert.strictEqual(sessionsMatchingSessionCwd(getSnapshot, '/from-history', never).length, 1);
    assert.strictEqual(sessionsMatchingSessionCwd(getSnapshot, undefined, never).length, 0);
  });

  it('matches undefined previous cwd when session cwd unresolved', () => {
    const getSnapshot = (launchTarget: 'claude-agent-acp' | 'codex-acp' | 'cursor-acp' | 'antigravity-acp') => {
      if (launchTarget !== 'codex-acp') {
        return emptySnapshot;
      }
      return {
        sessionHistory: [],
        sessions: {
          a: { sessionId: 'a', status: 'active' as const },
        },
      };
    };

    assert.strictEqual(sessionsMatchingSessionCwd(getSnapshot, undefined, never).length, 1);
  });
});

describe('firstFolderPath', () => {
  it('returns first path or undefined', () => {
    assert.strictEqual(firstFolderPath([]), undefined);
    assert.strictEqual(firstFolderPath(['/a', '/b']), '/a');
  });
});
