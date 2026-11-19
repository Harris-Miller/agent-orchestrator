import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { CODEX, freshRegistry } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { pinnedEntriesAtom, pinnedSessionsAtom } from './pinnedSessions.atoms.ts';
import { projectsAtom } from './projects.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';

describe('pinnedEntriesAtom', () => {
  it.effect('shows pins whose cwd is a loaded Project and hides (but keeps) the others', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [
          { cwd: '/proj', sessionId: 'in' },
          { cwd: '/scratch', sessionId: 'out' },
        ],
      }));
      registry.set(pinnedSessionsAtom(CODEX), [
        { cwd: '/proj', sessionId: 'in' },
        { cwd: '/scratch', sessionId: 'out' },
      ]);
      registry.set(projectsAtom, ['/proj']);
      const ids = () => registry.get(pinnedEntriesAtom).map(entry => entry.sessionId);
      assert.deepStrictEqual(ids(), ['in']);
      assert.strictEqual(registry.get(pinnedSessionsAtom(CODEX)).length, 2);
      registry.set(projectsAtom, ['/proj', '/scratch']);
      assert.sameMembers(ids(), ['in', 'out']);
      registry.set(sessionListScopeAtom, { _tag: 'Cwd', cwd: '/scratch' });
      assert.deepStrictEqual(ids(), ['out']);
    }).pipe(Effect.scoped),
  );
});
