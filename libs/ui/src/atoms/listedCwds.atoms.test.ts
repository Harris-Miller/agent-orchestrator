import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { AsyncResult } from 'effect/reactivity';

import { CODEX, freshRegistry } from './fakeAgent.testing.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { listedCwdsAtom, listedSessionHistoryAtom, visibleListedSessionHistoryAtom } from './listedCwds.atoms.ts';
import { projectsAtom } from './projects.atoms.ts';
import { sessionListScopeAtom } from './sessionListScope.atoms.ts';
import { userSettingsDocumentAtom } from './userSettings/userSettingsDocument.atoms.ts';

describe('listed cwds', () => {
  it.effect('follows the session list scope', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      registry.set(projectsAtom, ['/a', '/b']);
      assert.deepStrictEqual(registry.get(listedCwdsAtom), ['/a', '/b']);
      registry.set(sessionListScopeAtom, { _tag: 'Cwd', cwd: '/w' });
      assert.deepStrictEqual(registry.get(listedCwdsAtom), ['/w']);
      registry.set(sessionListScopeAtom, { _tag: 'Skip' });
      assert.deepStrictEqual(registry.get(listedCwdsAtom), []);
    }).pipe(Effect.scoped),
  );

  it.effect('restricts Session History rows to listed cwds and tracks Projects', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [
          { cwd: '/a', sessionId: 'in' },
          { archived: true, cwd: '/a', sessionId: 'in-archived' },
          { cwd: '/other', sessionId: 'out' },
        ],
      }));
      registry.set(projectsAtom, ['/a']);
      const all = () => registry.get(listedSessionHistoryAtom).map(entry => entry.sessionId);
      const visible = () => registry.get(visibleListedSessionHistoryAtom).map(entry => entry.sessionId);
      assert.sameMembers(all(), ['in', 'in-archived']);
      assert.deepStrictEqual(visible(), ['in']);
      registry.set(userSettingsDocumentAtom, AsyncResult.success({ showArchived: true }));
      assert.sameMembers(visible(), ['in', 'in-archived']);
      registry.set(projectsAtom, ['/a', '/other']);
      assert.sameMembers(all(), ['in', 'in-archived', 'out']);
    }).pipe(Effect.scoped),
  );

  it.effect('lists no Session History rows when the scope is Skip', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [{ cwd: '/a', sessionId: 'in' }],
      }));
      registry.set(projectsAtom, ['/a']);
      registry.set(sessionListScopeAtom, { _tag: 'Skip' });
      assert.deepStrictEqual(registry.get(listedSessionHistoryAtom), []);
      assert.deepStrictEqual(registry.get(visibleListedSessionHistoryAtom), []);
    }).pipe(Effect.scoped),
  );

  it.effect('restricts Session History rows to the Cwd scope cwd', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [
          { cwd: '/w', sessionId: 'in' },
          { cwd: '/a', sessionId: 'out' },
        ],
      }));
      registry.set(projectsAtom, ['/a']);
      registry.set(sessionListScopeAtom, { _tag: 'Cwd', cwd: '/w' });
      assert.deepStrictEqual(
        registry.get(listedSessionHistoryAtom).map(entry => entry.sessionId),
        ['in'],
      );
      assert.deepStrictEqual(
        registry.get(visibleListedSessionHistoryAtom).map(entry => entry.sessionId),
        ['in'],
      );
    }).pipe(Effect.scoped),
  );

  it.effect('updates visible rows when Projects are added and removed', () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry;
      updateHarnessSnapshot(registry, CODEX, current => ({
        ...current,
        sessionHistory: [{ cwd: '/a', sessionId: 'in' }],
      }));
      const visible = () => registry.get(visibleListedSessionHistoryAtom).map(entry => entry.sessionId);
      assert.deepStrictEqual(visible(), []);
      registry.set(projectsAtom, ['/a']);
      assert.deepStrictEqual(visible(), ['in']);
      registry.set(projectsAtom, []);
      assert.deepStrictEqual(visible(), []);
    }).pipe(Effect.scoped),
  );
});
