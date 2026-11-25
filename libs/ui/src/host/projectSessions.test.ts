import { assert, describe, it } from '@effect/vitest';

import { initialBackendHarnessSnapshot, initialSessionSnapshot } from './acpSessionBootstrap.ts';
import { projectMembership } from './projectSessions.ts';

const target = 'codex-acp' as const;
const base = initialBackendHarnessSnapshot();
const none = () => false;
const on = (snapshot: typeof base) => [{ launchTarget: target, snapshot }];

describe('projectMembership', () => {
  it('lists active and activating sessions of the cwd, from the snapshot or History cwd, never inactive or other cwds', () => {
    const next = {
      ...base,
      sessionHistory: [{ cwd: '/p', sessionId: 'viaHistory' }],
      sessions: {
        activating: { ...initialSessionSnapshot('activating', 'activating'), cwd: '/p' },
        elsewhere: { ...initialSessionSnapshot('elsewhere', 'active'), cwd: '/q' },
        idle: { ...initialSessionSnapshot('idle', 'inactive'), cwd: '/p' },
        live: { ...initialSessionSnapshot('live', 'active'), cwd: '/p' },
        viaHistory: initialSessionSnapshot('viaHistory', 'active'),
      },
    };
    const { activeSessions } = projectMembership(on(next), null, undefined, '/p', none);
    assert.sameMembers(
      activeSessions.map(s => s.sessionId),
      ['activating', 'live', 'viaHistory'],
    );
  });

  it('never counts a Spawned subagent child as an active session', () => {
    const next = {
      ...base,
      sessions: {
        child: { ...initialSessionSnapshot('child', 'active'), cwd: '/p' },
        live: { ...initialSessionSnapshot('live', 'active'), cwd: '/p' },
      },
    };
    const { activeSessions } = projectMembership(on(next), null, undefined, '/p', s => s.sessionId === 'child');
    assert.deepStrictEqual(
      activeSessions.map(s => s.sessionId),
      ['live'],
    );
  });

  const bound = (cwd: string | undefined) => ({ cwd, launchTarget: target, sessionId: 'bound' });

  it('counts the Bound Virtual session via its snapshot cwd', () => {
    const next = { ...base, sessions: { bound: { ...initialSessionSnapshot('bound', 'active'), cwd: '/p' } } };
    const m = projectMembership(on(next), bound('/p'), undefined, '/p', none);
    assert.deepStrictEqual(m.activeSessions, [{ launchTarget: target, sessionId: 'bound' }]);
    assert.isTrue(m.virtualBoundInProject);
  });

  it('follows the snapshot cwd when it differs from virtual.cwd', () => {
    const next = { ...base, sessions: { bound: { ...initialSessionSnapshot('bound', 'active'), cwd: '/p' } } };
    const inSnapshot = projectMembership(on(next), bound('/other'), undefined, '/p', none);
    assert.strictEqual(inSnapshot.activeSessions.length, 1);
    assert.isTrue(inSnapshot.virtualBoundInProject);
    const inVirtualOnly = projectMembership(on(next), bound('/p'), undefined, '/other', none);
    assert.deepStrictEqual(inVirtualOnly.activeSessions, []);
    assert.isFalse(inVirtualOnly.virtualBoundInProject);
  });

  it('falls back to virtual.cwd for a Bound Virtual session with no snapshot cwd', () => {
    const next = { ...base, sessions: { bound: initialSessionSnapshot('bound', 'active') } };
    const m = projectMembership(on(next), bound('/p'), undefined, '/p', none);
    assert.strictEqual(m.activeSessions.length, 1);
    assert.isTrue(m.virtualBoundInProject);
    assert.deepStrictEqual(projectMembership(on(next), null, undefined, '/p', none).activeSessions, []);
  });

  it('never counts a Virtual draft with no Bound session', () => {
    const next = { ...base, sessions: { live: { ...initialSessionSnapshot('live', 'active'), cwd: '/p' } } };
    const m = projectMembership(on(next), { cwd: '/p', launchTarget: target }, undefined, '/p', none);
    assert.deepStrictEqual(m.activeSessions, [{ launchTarget: target, sessionId: 'live' }]);
    assert.isFalse(m.virtualBoundInProject);
  });

  it('reports whether the Selected session is in the Project', () => {
    const next = {
      ...base,
      sessions: { idle: { ...initialSessionSnapshot('idle', 'inactive'), cwd: '/p' } },
    };
    const selected = { _tag: 'Session', sessionId: 'idle' } as const;
    assert.isTrue(projectMembership(on(next), null, selected, '/p', none).selectedInProject);
    assert.isFalse(projectMembership(on(next), null, selected, '/q', none).selectedInProject);
    assert.isFalse(projectMembership(on(next), null, { _tag: 'Virtual' }, '/p', none).selectedInProject);
  });

  describe('Workspace projects', () => {
    const W = '/w/app.code-workspace';
    const projects = ['/p', W];
    const next = {
      ...base,
      sessions: {
        inDirectory: { ...initialSessionSnapshot('inDirectory', 'active'), cwd: '/p' },
        inWorkspace: { ...initialSessionSnapshot('inWorkspace', 'active'), cwd: '/p', workspaceFile: W },
      },
    };

    it('splits two Projects sharing a first folder by the Workspace file the session carries', () => {
      const ids = (project: string) =>
        projectMembership(on(next), null, undefined, project, none, projects).activeSessions.map(s => s.sessionId);
      assert.deepStrictEqual(ids('/p'), ['inDirectory']);
      assert.deepStrictEqual(ids(W), ['inWorkspace']);
    });

    it('leaves a session stamped with a Workspace file that is not a Project in its directory Project', () => {
      const m = projectMembership(on(next), null, undefined, '/p', none, ['/p']);
      assert.deepStrictEqual(m.activeSessions.map(s => s.sessionId).toSorted(), ['inDirectory', 'inWorkspace']);
    });

    it('reads the Workspace file of the Bound Virtual blob when its session has no cwd yet', () => {
      const bare = { ...base, sessions: { bound: initialSessionSnapshot('bound', 'active') } };
      const virtual = { cwd: '/p', launchTarget: target, sessionId: 'bound', workspaceFile: W };
      assert.isTrue(projectMembership(on(bare), virtual, undefined, W, none, projects).virtualBoundInProject);
      assert.isFalse(projectMembership(on(bare), virtual, undefined, '/p', none, projects).virtualBoundInProject);
    });
  });
});
