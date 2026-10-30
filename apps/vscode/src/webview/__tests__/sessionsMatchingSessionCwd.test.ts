import { assert, describe, it } from '@effect/vitest';

import { firstFolderPath, sessionsMatchingSessionCwd } from '../sessionsMatchingSessionCwd.ts';

const emptySnapshot = { sessionRoster: [], sessions: {} };

describe('sessionsMatchingSessionCwd', () => {
  it('matches active and activating by resolved cwd; skips inactive', () => {
    const getSnapshot = (launchTarget: 'claude-agent-acp' | 'codex-acp' | 'cursor-acp' | 'antigravity-acp') => {
      if (launchTarget !== 'codex-acp') {
        return emptySnapshot;
      }
      return {
        sessionRoster: [
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

    const matches = sessionsMatchingSessionCwd(getSnapshot, '/ws');
    assert.deepStrictEqual(
      matches.map(m => m.sessionId).sort(),
      ['a', 'b'],
    );
  });

  it('uses roster cwd when snapshot cwd missing', () => {
    const getSnapshot = (launchTarget: 'claude-agent-acp' | 'codex-acp' | 'cursor-acp' | 'antigravity-acp') => {
      if (launchTarget !== 'codex-acp') {
        return emptySnapshot;
      }
      return {
        sessionRoster: [{ cwd: '/from-roster', sessionId: 'a' }],
        sessions: {
          a: { sessionId: 'a', status: 'active' as const },
        },
      };
    };

    assert.strictEqual(sessionsMatchingSessionCwd(getSnapshot, '/from-roster').length, 1);
    assert.strictEqual(sessionsMatchingSessionCwd(getSnapshot, undefined).length, 0);
  });

  it('matches undefined previous cwd when session cwd unresolved', () => {
    const getSnapshot = (launchTarget: 'claude-agent-acp' | 'codex-acp' | 'cursor-acp' | 'antigravity-acp') => {
      if (launchTarget !== 'codex-acp') {
        return emptySnapshot;
      }
      return {
        sessionRoster: [],
        sessions: {
          a: { sessionId: 'a', status: 'active' as const },
        },
      };
    };

    assert.strictEqual(sessionsMatchingSessionCwd(getSnapshot, undefined).length, 1);
  });
});

describe('firstFolderPath', () => {
  it('returns first path or undefined', () => {
    assert.strictEqual(firstFolderPath([]), undefined);
    assert.strictEqual(firstFolderPath(['/a', '/b']), '/a');
  });
});
