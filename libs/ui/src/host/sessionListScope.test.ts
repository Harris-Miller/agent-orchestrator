import { assert, describe, it } from '@effect/vitest';

import {
  listCwdsForScope,
  listSessionsPayload,
  scopeReadsProjects,
  sessionListScopeFromPaths,
} from './sessionListScope.ts';

describe('sessionListScope', () => {
  it('only the Projects scope reads projects.json; vscode scopes never do', () => {
    assert.isTrue(scopeReadsProjects({ _tag: 'Projects' }));
    assert.isFalse(scopeReadsProjects({ _tag: 'Cwd', cwd: '/a' }));
    assert.isFalse(scopeReadsProjects({ _tag: 'Skip' }));
  });

  it('sessionListScopeFromPaths maps empty to Skip and first path to Cwd', () => {
    assert.deepStrictEqual(sessionListScopeFromPaths([]), { _tag: 'Skip' });
    assert.deepStrictEqual(sessionListScopeFromPaths(['/a', '/b']), { _tag: 'Cwd', cwd: '/a' });
  });

  it('listCwdsForScope lists every Project, the one Workspace cwd, or nothing', () => {
    assert.deepStrictEqual(listCwdsForScope({ _tag: 'Projects' }, ['/a', '/b'], {}), ['/a', '/b']);
    assert.deepStrictEqual(listCwdsForScope({ _tag: 'Cwd', cwd: '/ws' }, ['/a'], {}), ['/ws']);
    assert.deepStrictEqual(listCwdsForScope({ _tag: 'Skip' }, ['/a'], {}), []);
  });

  it('listCwdsForScope lists a Workspace project by its first folder, and an errored one by nothing', () => {
    const states = {
      '/w/ok.code-workspace': { _tag: 'Resolved' as const, folders: ['/a', '/b'] },
      '/w/bad.code-workspace': { _tag: 'Failed' as const, message: 'gone' },
    };
    assert.deepStrictEqual(
      listCwdsForScope({ _tag: 'Projects' }, ['/w/ok.code-workspace', '/w/bad.code-workspace', '/a'], states),
      ['/a'],
    );
  });

  it('listSessionsPayload sends the AIR meta only to sessionIndex launch targets', () => {
    const air = {
      _meta: { jetbrains: { air: { list: { archived: 'all' as const, limit: 100 }, version: 1 as const } } },
    };
    assert.deepStrictEqual(listSessionsPayload('claude-agent-acp', '/ws'), { ...air, cwd: '/ws' });
    assert.deepStrictEqual(listSessionsPayload('codex-acp', '/ws'), { ...air, cwd: '/ws' });
    assert.deepStrictEqual(listSessionsPayload('cursor-acp', '/ws'), { cwd: '/ws' });
    assert.deepStrictEqual(listSessionsPayload('antigravity-acp', '/ws'), { cwd: '/ws' });
  });
});
