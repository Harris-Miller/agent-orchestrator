import { assert, describe, it } from '@effect/vitest';

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { activeSessionsInCwd } from './projectSessions.ts';

const snapshot = initialBackendHarnessSnapshot();

describe('activeSessionsInCwd', () => {
  it('lists active and activating sessions of the cwd, from the snapshot or History cwd, never inactive or other cwds', () => {
    const next = {
      ...snapshot,
      sessionHistory: [{ cwd: '/p', sessionId: 'viaHistory' }],
      sessions: {
        activating: { ...initialSessionSnapshot('activating', 'activating'), cwd: '/p' },
        elsewhere: { ...initialSessionSnapshot('elsewhere', 'active'), cwd: '/q' },
        idle: { ...initialSessionSnapshot('idle', 'inactive'), cwd: '/p' },
        live: { ...initialSessionSnapshot('live', 'active'), cwd: '/p' },
        viaHistory: initialSessionSnapshot('viaHistory', 'active'),
      },
    };
    assert.sameMembers([...activeSessionsInCwd(next, '/p')], ['activating', 'live', 'viaHistory']);
  });

  it('counts the Bound Virtual session of the cwd even without a History row or snapshot cwd', () => {
    const next = { ...snapshot, sessions: { bound: initialSessionSnapshot('bound', 'active') } };
    assert.deepStrictEqual(activeSessionsInCwd(next, '/p', { cwd: '/p', sessionId: 'bound' }), ['bound']);
    assert.deepStrictEqual(activeSessionsInCwd(next, '/p'), []);
  });
});
